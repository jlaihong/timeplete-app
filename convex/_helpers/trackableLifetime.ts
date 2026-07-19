/**
 * Maintains `trackables.lifetime*` and `firstActivityDayYYYYMMDD` so the
 * home + analytics readers can serve all-time totals straight off the
 * trackable document. The previous implementation re-aggregated the
 * user's entire activity history on every reactive fire of
 * `getGoalDetails` / `getTrackableAnalyticsSeries`, which was the single
 * largest contributor to dashboard `Reads` bandwidth on the home page.
 *
 * Contract (after `_admin/backfillTrackableLifetime` has run):
 *
 *   trackable.lifetimeTotalSeconds
 *     === Σ timeWindows.durationSeconds
 *         WHERE resolveAttributedTrackableId(window, task, list links)
 *               === trackable._id
 *           AND timeWindows.budgetType   === "ACTUAL"
 *       + Σ trackerEntries.durationSeconds   (TRACKER trackables only)
 *         WHERE trackerEntries.trackableId === trackable._id
 *
 *   trackable.lifetimeCalendarCount
 *     === count of timeWindows rows above
 *
 *   trackable.lifetimeStoredDayCount
 *     === Σ trackableDays.numCompleted WHERE trackableId === trackable._id
 *
 *   trackable.lifetimeTrackerEntryCount
 *     === Σ trackerEntries.countValue           (TRACKER only)
 *
 *   trackable.lifetimeTrackerEntrySeconds
 *     === Σ trackerEntries.durationSeconds      (TRACKER only)
 *
 *   trackable.lifetimeTrackerEntryRowCount
 *     === count of trackerEntries rows
 *
 *   trackable.lifetimeAttributedTaskDayCount
 *     === count of completed tasks whose attribution
 *         (`task.trackableId` else `task.listId → listTrackableLinks`)
 *         resolves to this trackable. Maintained by
 *         `onTaskCompletionAttribution` from `tasks.upsert` whenever a
 *         task's `dateCompleted`, `trackableId`, or `listId` changes
 *         (or the resolved-via-list attribution changes shape).
 *
 *   trackable.firstActivityDayYYYYMMDD
 *     === min day across all attributed windows / days / entries; falls
 *         back to `startDayYYYYMMDD` when no activity recorded.
 *
 * Additionally maintains the `trackableDaySeconds` table (after
 * `_admin/backfillTrackableDaySeconds` has run):
 *
 *   trackableDaySeconds[trackableId, day].attributedSeconds
 *     === Σ timeWindows.durationSeconds
 *         WHERE resolveAttributedTrackableId(...) === trackableId
 *           AND budgetType === "ACTUAL"
 *           AND toCompactYYYYMMDD(startDayYYYYMMDD) === day
 *
 * These rows let `getGoalDetails` compute per-week attributed seconds
 * (the `MINUTES_A_WEEK` overall-progress loop) without re-reading the
 * raw window history.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  resolveAttributedTrackableId,
  resolveSnapshotTrackableIdForTask,
  type TaskInfo,
} from "./trackableAttribution";
import { isYYYYMMDDCompact, toCompactYYYYMMDD } from "./compactYYYYMMDD";
import {
  onTimeWindowDeleted,
} from "./taskTimeSpent";

export type WindowLifetimeRow = Pick<
  Doc<"timeWindows">,
  | "userId"
  | "trackableId"
  | "taskId"
  | "listId"
  | "budgetType"
  | "durationSeconds"
  | "startDayYYYYMMDD"
  | "activityType"
>;

type LifetimePatch = {
  totalSeconds?: number;
  calendarCount?: number;
  storedDayCount?: number;
  trackerEntryCount?: number;
  trackerEntrySeconds?: number;
  trackerEntryRowCount?: number;
  attributedTaskDayCount?: number;
};

async function applyDelta(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  delta: LifetimePatch,
  activityDay?: string,
): Promise<void> {
  const t = await ctx.db.get(trackableId);
  if (!t) return;
  const patch: Record<string, unknown> = {};
  if (delta.totalSeconds !== undefined) {
    patch.lifetimeTotalSeconds = Math.max(
      0,
      (t.lifetimeTotalSeconds ?? 0) + delta.totalSeconds,
    );
  }
  if (delta.calendarCount !== undefined) {
    patch.lifetimeCalendarCount = Math.max(
      0,
      (t.lifetimeCalendarCount ?? 0) + delta.calendarCount,
    );
  }
  if (delta.storedDayCount !== undefined) {
    patch.lifetimeStoredDayCount = Math.max(
      0,
      (t.lifetimeStoredDayCount ?? 0) + delta.storedDayCount,
    );
  }
  if (delta.trackerEntryCount !== undefined) {
    patch.lifetimeTrackerEntryCount = Math.max(
      0,
      (t.lifetimeTrackerEntryCount ?? 0) + delta.trackerEntryCount,
    );
  }
  if (delta.trackerEntrySeconds !== undefined) {
    patch.lifetimeTrackerEntrySeconds = Math.max(
      0,
      (t.lifetimeTrackerEntrySeconds ?? 0) + delta.trackerEntrySeconds,
    );
  }
  if (delta.trackerEntryRowCount !== undefined) {
    patch.lifetimeTrackerEntryRowCount = Math.max(
      0,
      (t.lifetimeTrackerEntryRowCount ?? 0) + delta.trackerEntryRowCount,
    );
  }
  if (delta.attributedTaskDayCount !== undefined) {
    patch.lifetimeAttributedTaskDayCount = Math.max(
      0,
      (t.lifetimeAttributedTaskDayCount ?? 0) + delta.attributedTaskDayCount,
    );
  }
  if (activityDay) {
    const current = t.firstActivityDayYYYYMMDD;
    if (!current || activityDay < current) {
      patch.firstActivityDayYYYYMMDD = activityDay;
    }
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(trackableId, patch);
  }
}

/**
 * Applies a signed seconds delta to the `(trackableId, dayYYYYMMDD)`
 * bucket in `trackableDaySeconds`. Mirrors the `lifetimeTotalSeconds`
 * window deltas so `getGoalDetails` can compute weekly sums (the
 * `MINUTES_A_WEEK` overall-progress loop) without scanning historical
 * `timeWindows` rows. Rows are created on demand and deleted when the
 * sum returns to zero. `dayYYYYMMDD` must be compact (validated by the
 * callers).
 */
async function bumpTrackableDaySeconds(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  userId: Id<"users">,
  dayYYYYMMDD: string,
  deltaSeconds: number,
): Promise<void> {
  if (deltaSeconds === 0) return;
  const existing = await ctx.db
    .query("trackableDaySeconds")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackableId).eq("dayYYYYMMDD", dayYYYYMMDD),
    )
    .unique();

  if (!existing) {
    if (deltaSeconds > 0) {
      await ctx.db.insert("trackableDaySeconds", {
        trackableId,
        userId,
        dayYYYYMMDD,
        attributedSeconds: deltaSeconds,
      });
    }
    return;
  }

  const next = Math.max(0, existing.attributedSeconds + deltaSeconds);
  if (next === 0) {
    await ctx.db.delete(existing._id);
    return;
  }
  if (next === existing.attributedSeconds) return;
  await ctx.db.patch(existing._id, { attributedSeconds: next });
}

async function loadListIdToTrackableIdForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Map<string, Id<"trackables">>> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  return buildListIdToTrackableId(links);
}

async function loadTaskInfoForWindow(
  ctx: MutationCtx,
  taskId: Id<"tasks"> | undefined,
): Promise<TaskInfo | null> {
  if (!taskId) return null;
  const task = await ctx.db.get(taskId);
  if (!task) return null;
  return {
    trackableId: task.trackableId ?? null,
    listId: task.listId ?? null,
  };
}

function taskInfoMapForWindow(
  taskId: Id<"tasks"> | undefined,
  taskInfo: TaskInfo | null,
): Map<string, TaskInfo> {
  const m = new Map<string, TaskInfo>();
  if (taskId && taskInfo) {
    m.set(String(taskId), taskInfo);
  }
  return m;
}

/** Single-bucket attribution — matches P1 coalesce / `get_time_track_sums`. */
function resolveLifetimeTrackableId(
  tw: Pick<
    Doc<"timeWindows">,
    "trackableId" | "taskId" | "listId" | "budgetType"
  >,
  taskInfo: TaskInfo | null,
  listIdToTrackableId: Map<string, Id<"trackables">>,
): Id<"trackables"> | undefined {
  if (tw.budgetType !== "ACTUAL") return undefined;
  return (
    resolveAttributedTrackableId(
      tw,
      taskInfoMapForWindow(tw.taskId, taskInfo),
      listIdToTrackableId,
    ) ?? undefined
  );
}

async function resolveLifetimeTrackableIdForWindow(
  ctx: MutationCtx,
  tw: WindowLifetimeRow,
  listIdToTrackableId?: Map<string, Id<"trackables">>,
  taskInfo?: TaskInfo | null,
): Promise<Id<"trackables"> | undefined> {
  const map =
    listIdToTrackableId ??
    (await loadListIdToTrackableIdForUser(ctx, tw.userId));
  const info =
    taskInfo !== undefined
      ? taskInfo
      : await loadTaskInfoForWindow(ctx, tw.taskId);
  return resolveLifetimeTrackableId(tw, info, map);
}

async function applyCoalesceLifetimeDelta(
  ctx: MutationCtx,
  tw: WindowLifetimeRow,
  sign: 1 | -1,
  listIdToTrackableId?: Map<string, Id<"trackables">>,
  taskInfo?: TaskInfo | null,
): Promise<void> {
  if (tw.budgetType !== "ACTUAL") return;
  const dur = tw.durationSeconds ?? 0;
  if (dur <= 0) return;
  const day = toCompactYYYYMMDD(tw.startDayYYYYMMDD);
  const activityDay = isYYYYMMDDCompact(day) ? day : undefined;
  const trackableId = await resolveLifetimeTrackableIdForWindow(
    ctx,
    tw,
    listIdToTrackableId,
    taskInfo,
  );
  if (!trackableId) return;
  await applyDelta(
    ctx,
    trackableId,
    {
      totalSeconds: sign * dur,
      calendarCount: sign,
    },
    sign > 0 ? activityDay : undefined,
  );
  if (activityDay) {
    await bumpTrackableDaySeconds(
      ctx,
      trackableId,
      tw.userId,
      activityDay,
      sign * dur,
    );
  }
}

/** Call after inserting an ACTUAL `timeWindows` row. */
export async function onAttributedWindowInserted(
  ctx: MutationCtx,
  tw: WindowLifetimeRow,
): Promise<void> {
  await applyCoalesceLifetimeDelta(ctx, tw, 1);
}

/** Call after patching an ACTUAL `timeWindows` row. */
export async function onAttributedWindowPatched(
  ctx: MutationCtx,
  before: WindowLifetimeRow,
  after: WindowLifetimeRow,
): Promise<void> {
  const userId = after.userId ?? before.userId;
  const listMap = await loadListIdToTrackableIdForUser(ctx, userId);
  const [beforeTask, afterTask] = await Promise.all([
    loadTaskInfoForWindow(ctx, before.taskId),
    loadTaskInfoForWindow(ctx, after.taskId),
  ]);

  await applyCoalesceLifetimeDelta(ctx, before, -1, listMap, beforeTask);
  await applyCoalesceLifetimeDelta(ctx, after, 1, listMap, afterTask);
}

/** Call after deleting an ACTUAL `timeWindows` row. */
export async function onAttributedWindowDeleted(
  ctx: MutationCtx,
  tw: WindowLifetimeRow,
): Promise<void> {
  await applyCoalesceLifetimeDelta(ctx, tw, -1);
}

/**
 * Delete a time window and keep task totals + trackable lifetime in sync.
 * Use this instead of bare `ctx.db.delete` everywhere.
 */
export async function deleteTimeWindowWithSideEffects(
  ctx: MutationCtx,
  tw: Doc<"timeWindows">,
): Promise<void> {
  await ctx.db.delete(tw._id);
  await onTimeWindowDeleted(ctx, {
    taskId: tw.taskId,
    activityType: tw.activityType,
    budgetType: tw.budgetType,
    durationSeconds: tw.durationSeconds,
  });
  await onAttributedWindowDeleted(ctx, tw);
}

/**
 * Re-snapshot task windows and move lifetime credit when attribution changes.
 */
async function resyncTaskWindowsOnAttributionChange(
  ctx: MutationCtx,
  windows: Doc<"timeWindows">[],
  beforeTaskInfo: TaskInfo,
  afterTaskInfo: TaskInfo,
  beforeListMap: Map<string, Id<"trackables">>,
  afterListMap: Map<string, Id<"trackables">>,
  newSnapshot: Id<"trackables"> | undefined,
): Promise<void> {
  for (const w of windows) {
    if (w.budgetType !== "ACTUAL" || w.activityType !== "TASK") continue;
    const dur = w.durationSeconds ?? 0;
    if (dur <= 0) continue;
    const day = toCompactYYYYMMDD(w.startDayYYYYMMDD);
    if (!isYYYYMMDDCompact(day)) continue;

    const beforeId = resolveLifetimeTrackableId(
      w,
      beforeTaskInfo,
      beforeListMap,
    );
    const afterWindow: WindowLifetimeRow = {
      ...w,
      trackableId: newSnapshot,
    };
    const afterId = resolveLifetimeTrackableId(
      afterWindow,
      afterTaskInfo,
      afterListMap,
    );

    if (w.trackableId !== newSnapshot) {
      await ctx.db.patch(w._id, { trackableId: newSnapshot });
    }

    if (beforeId === afterId) continue;

    if (beforeId) {
      await applyDelta(ctx, beforeId, {
        totalSeconds: -dur,
        calendarCount: -1,
      });
      await bumpTrackableDaySeconds(ctx, beforeId, w.userId, day, -dur);
    }
    if (afterId) {
      await applyDelta(
        ctx,
        afterId,
        { totalSeconds: dur, calendarCount: 1 },
        day,
      );
      await bumpTrackableDaySeconds(ctx, afterId, w.userId, day, dur);
    }
  }
}

/** Call after patching `trackableDays.numCompleted` (or inserting/deleting). */
export async function onTrackableDayDelta(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    deltaNumCompleted: number;
    dayYYYYMMDD: string;
  },
): Promise<void> {
  if (args.deltaNumCompleted === 0) return;
  await applyDelta(
    ctx,
    args.trackableId,
    { storedDayCount: args.deltaNumCompleted },
    args.dayYYYYMMDD,
  );
}

/**
 * Adjusts `trackableDays.attributedTaskCount` for a single
 * `(trackableId, dayYYYYMMDD)` pair, creating the row on demand and
 * deleting it when both the manual count and the attributed count drop
 * to zero. `delta` must be ±1 (signed).
 */
async function bumpTrackableDayAttributedTaskCount(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  userId: Id<"users">,
  dayYYYYMMDD: string,
  delta: 1 | -1,
): Promise<void> {
  const existing = await ctx.db
    .query("trackableDays")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackableId).eq("dayYYYYMMDD", dayYYYYMMDD),
    )
    .unique();

  if (!existing) {
    // Only create a row on increment; decrementing into a non-existent
    // row is a no-op (the count is already implicitly zero).
    if (delta > 0) {
      await ctx.db.insert("trackableDays", {
        trackableId,
        userId,
        dayYYYYMMDD,
        numCompleted: 0,
        attributedTaskCount: 1,
        comments: "",
      });
    }
    return;
  }

  const next = Math.max(0, (existing.attributedTaskCount ?? 0) + delta);

  // Garbage-collect when the row has nothing left to say. We only
  // delete rows we wouldn't have created in the manual-entry path
  // (numCompleted === 0 and comments is empty); otherwise we'd lose
  // the user's manual annotation.
  if (
    next === 0 &&
    existing.numCompleted === 0 &&
    (existing.comments ?? "") === ""
  ) {
    await ctx.db.delete(existing._id);
    return;
  }

  if (next === (existing.attributedTaskCount ?? 0)) return;
  await ctx.db.patch(existing._id, { attributedTaskCount: next });
}

/**
 * Resolves the attributed trackable for a task using
 * `resolveSnapshotTrackableIdForTask`. Loads `listTrackableLinks` lazily
 * via a cache that the caller can reuse across multiple calls in the
 * same mutation. Returns `undefined` when the task is unattributable.
 */
async function resolveTaskAttribution(
  ctx: MutationCtx,
  task: Pick<Doc<"tasks">, "userId" | "trackableId" | "listId"> | null,
  linkCache: { byUser: Map<string, Map<string, Id<"trackables">>> },
): Promise<Id<"trackables"> | undefined> {
  if (!task) return undefined;
  if (task.trackableId) return task.trackableId;
  if (!task.listId) return undefined;

  let linkMap = linkCache.byUser.get(task.userId);
  if (!linkMap) {
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", task.userId))
      .collect();
    linkMap = buildListIdToTrackableId(links);
    linkCache.byUser.set(task.userId, linkMap);
  }
  return linkMap.get(task.listId) ?? undefined;
}

/**
 * Call from `tasks.upsert` (and any other writer that mutates a task's
 * `dateCompleted`, `trackableId`, or `listId` fields) to keep
 * `trackables.lifetimeAttributedTaskDayCount` in sync with the
 * "completed task counts as 1 day for its attributed trackable" rule
 * that `getGoalDetails` and `getTrackableAnalyticsSeries` apply.
 *
 * Pass `null` for `before` on insert and `null` for `after` on delete.
 * Idempotent — if neither side resolves to a trackable nothing happens.
 */
export async function onTaskCompletionAttribution(
  ctx: MutationCtx,
  before: Pick<
    Doc<"tasks">,
    "userId" | "dateCompleted" | "trackableId" | "listId"
  > | null,
  after: Pick<
    Doc<"tasks">,
    "userId" | "dateCompleted" | "trackableId" | "listId"
  > | null,
): Promise<void> {
  const linkCache = {
    byUser: new Map<string, Map<string, Id<"trackables">>>(),
  };

  const wasCounted = before != null && !!before.dateCompleted;
  const isCounted = after != null && !!after.dateCompleted;

  const beforeTrackable = wasCounted
    ? await resolveTaskAttribution(ctx, before, linkCache)
    : undefined;
  const afterTrackable = isCounted
    ? await resolveTaskAttribution(ctx, after, linkCache)
    : undefined;

  // No net change to attribution → nothing to do, even if the task's
  // `dateCompleted` value itself flipped between two equally-attributed
  // states (the per-day counters track the resolved trackable, not the
  // raw task fields).
  if (
    beforeTrackable === afterTrackable &&
    before?.dateCompleted === after?.dateCompleted
  ) {
    return;
  }

  if (beforeTrackable) {
    await applyDelta(ctx, beforeTrackable, { attributedTaskDayCount: -1 });
    const beforeDay = before?.dateCompleted
      ? toCompactYYYYMMDD(before.dateCompleted)
      : "";
    if (isYYYYMMDDCompact(beforeDay)) {
      await bumpTrackableDayAttributedTaskCount(
        ctx,
        beforeTrackable,
        before!.userId,
        beforeDay,
        -1,
      );
    }
  }
  if (afterTrackable) {
    const afterDay = after?.dateCompleted
      ? toCompactYYYYMMDD(after.dateCompleted)
      : "";
    const validDay = isYYYYMMDDCompact(afterDay) ? afterDay : undefined;
    await applyDelta(
      ctx,
      afterTrackable,
      { attributedTaskDayCount: 1 },
      validDay,
    );
    if (validDay) {
      await bumpTrackableDayAttributedTaskCount(
        ctx,
        afterTrackable,
        after!.userId,
        validDay,
        1,
      );
    }
  }
}

/**
 * When a task's `trackableId` or `listId` changes, re-snapshot its ACTUAL
 * task windows and move lifetime credit so totals follow the task.
 */
export async function onTaskTimeAttributionChange(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  before: Pick<Doc<"tasks">, "userId" | "trackableId" | "listId">,
  after: Pick<Doc<"tasks">, "userId" | "trackableId" | "listId">,
): Promise<void> {
  if (
    before.trackableId === after.trackableId &&
    before.listId === after.listId
  ) {
    return;
  }

  const listMap = await loadListIdToTrackableIdForUser(ctx, after.userId);
  const beforeTaskInfo: TaskInfo = {
    trackableId: before.trackableId ?? null,
    listId: before.listId ?? null,
  };
  const afterTaskInfo: TaskInfo = {
    trackableId: after.trackableId ?? null,
    listId: after.listId ?? null,
  };
  const newSnapshot = resolveSnapshotTrackableIdForTask({
    task: afterTaskInfo,
    listIdToTrackableId: listMap,
  });

  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  await resyncTaskWindowsOnAttributionChange(
    ctx,
    windows,
    beforeTaskInfo,
    afterTaskInfo,
    listMap,
    listMap,
    newSnapshot,
  );
}

/**
 * When a list's linked trackable changes, resync lifetime for tasks that
 * attribute via that list (no direct `task.trackableId`):
 *
 *   - time credit: re-snapshot each task's ACTUAL windows and move
 *     `lifetimeTotalSeconds` / `lifetimeCalendarCount` /
 *     `trackableDaySeconds` buckets (via
 *     `resyncTaskWindowsOnAttributionChange`).
 *   - completed-task day credit: move `lifetimeAttributedTaskDayCount`
 *     and `trackableDays.attributedTaskCount` for each completed task,
 *     mirroring `onTaskCompletionAttribution`. Without this, re-linking
 *     a list moved the seconds but left DAYS_A_WEEK / count-style
 *     progress on the old trackable.
 */
export async function onListTrackableLinkChange(
  ctx: MutationCtx,
  userId: Id<"users">,
  listId: Id<"lists">,
  beforeTrackableId: Id<"trackables"> | undefined,
  afterTrackableId: Id<"trackables"> | undefined,
): Promise<void> {
  if (beforeTrackableId === afterTrackableId) return;

  const afterListMap = await loadListIdToTrackableIdForUser(ctx, userId);
  const beforeListMap = new Map(afterListMap);
  if (beforeTrackableId) {
    beforeListMap.set(listId, beforeTrackableId);
  } else {
    beforeListMap.delete(listId);
  }

  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .collect();

  for (const task of tasks) {
    if (task.userId !== userId) continue;
    const taskInfo: TaskInfo = {
      trackableId: task.trackableId ?? null,
      listId: task.listId ?? null,
    };
    const newSnapshot = resolveSnapshotTrackableIdForTask({
      task: taskInfo,
      listIdToTrackableId: afterListMap,
    });
    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    await resyncTaskWindowsOnAttributionChange(
      ctx,
      windows,
      taskInfo,
      taskInfo,
      beforeListMap,
      afterListMap,
      newSnapshot,
    );

    // Completed-task day credit follows the link too. Only tasks whose
    // attribution flows THROUGH the list qualify — a direct
    // `task.trackableId` overrides the list link on both sides, so the
    // resolved trackable didn't change for those. Deltas mirror
    // `onTaskCompletionAttribution` (unconditional lifetime counter,
    // per-day row only for a valid compact day).
    if (task.dateCompleted && !task.trackableId) {
      const day = toCompactYYYYMMDD(task.dateCompleted);
      const validDay = isYYYYMMDDCompact(day) ? day : undefined;
      if (beforeTrackableId) {
        await applyDelta(ctx, beforeTrackableId, {
          attributedTaskDayCount: -1,
        });
        if (validDay) {
          await bumpTrackableDayAttributedTaskCount(
            ctx,
            beforeTrackableId,
            userId,
            validDay,
            -1,
          );
        }
      }
      if (afterTrackableId) {
        await applyDelta(
          ctx,
          afterTrackableId,
          { attributedTaskDayCount: 1 },
          validDay,
        );
        if (validDay) {
          await bumpTrackableDayAttributedTaskCount(
            ctx,
            afterTrackableId,
            userId,
            validDay,
            1,
          );
        }
      }
    }
  }
}

/**
 * Call after inserting / removing / patching a `trackerEntries` row.
 *
 * `deltaRowCount` is +1 on insert, -1 on delete, and 0 on patch (the
 * row already exists). All other deltas are signed.
 */
export async function onTrackerEntryDelta(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    deltaCountValue: number;
    deltaDurationSeconds: number;
    deltaRowCount: number;
    dayYYYYMMDD: string;
  },
): Promise<void> {
  await applyDelta(
    ctx,
    args.trackableId,
    {
      trackerEntryCount: args.deltaCountValue,
      trackerEntrySeconds: args.deltaDurationSeconds,
      trackerEntryRowCount: args.deltaRowCount,
      // For TRACKER trackables, the entry duration also feeds the
      // overall lifetimeTotalSeconds (mirrors `getGoalDetails`'s
      // `secondsAttributed + (isTracker ? trackerSeconds : 0)`).
      totalSeconds: args.deltaDurationSeconds,
    },
    args.dayYYYYMMDD,
  );
}
