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
  /**
   * Daily-average aggregate deltas (see schema doc on
   * `lifetimeActiveTimeDayCount` and friends). Only applied when the
   * trackable has been seeded by `_admin/backfillTrackerAverages`
   * (`lifetimeActiveTimeDayCount !== undefined` is the sentinel for all
   * four fields) — until then the readers use the legacy full scan and
   * partial increments would only corrupt the eventual seed.
   */
  activeTimeDayCount?: number;
  countActiveDayCount?: number;
  countDaySumTotal?: number;
  countDayMeanTotal?: number;
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
  if (t.lifetimeActiveTimeDayCount !== undefined) {
    if (delta.activeTimeDayCount !== undefined && delta.activeTimeDayCount !== 0) {
      patch.lifetimeActiveTimeDayCount = Math.max(
        0,
        t.lifetimeActiveTimeDayCount + delta.activeTimeDayCount,
      );
    }
    if (
      delta.countActiveDayCount !== undefined &&
      delta.countActiveDayCount !== 0
    ) {
      patch.lifetimeCountActiveDayCount = Math.max(
        0,
        (t.lifetimeCountActiveDayCount ?? 0) + delta.countActiveDayCount,
      );
    }
    if (delta.countDaySumTotal !== undefined && delta.countDaySumTotal !== 0) {
      patch.lifetimeCountDaySumTotal = Math.max(
        0,
        (t.lifetimeCountDaySumTotal ?? 0) + delta.countDaySumTotal,
      );
    }
    if (
      delta.countDayMeanTotal !== undefined &&
      delta.countDayMeanTotal !== 0
    ) {
      patch.lifetimeCountDayMeanTotal = Math.max(
        0,
        (t.lifetimeCountDayMeanTotal ?? 0) + delta.countDayMeanTotal,
      );
    }
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
 * True when the trackable has at least one entry with logged time on
 * `dayYYYYMMDD` (compact). Used to decide whether a
 * `trackableDaySeconds` row appearing/disappearing changes the day's
 * membership in the `lifetimeActiveTimeDayCount` set — a day stays
 * "time-active" as long as EITHER source still has time on it.
 */
async function dayHasTimedEntry(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  dayYYYYMMDD: string,
): Promise<boolean> {
  const entries = await ctx.db
    .query("trackerEntries")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackableId).eq("dayYYYYMMDD", dayYYYYMMDD),
    )
    .collect();
  return entries.some((e) => (e.durationSeconds ?? 0) > 0);
}

/**
 * Monday (compact YYYYMMDD) of the week containing `dayCompact`, plus
 * the day's index within that week (Monday = 0 … Sunday = 6). Matches
 * `startOfWeekYYYYMMDD` in `trackables.ts` (productivity-one weeks).
 */
export function weekPositionYYYYMMDD(dayCompact: string): {
  monday: string;
  dayIndex: number;
} {
  const y = Number(dayCompact.slice(0, 4));
  const m = Number(dayCompact.slice(4, 6));
  const d = Number(dayCompact.slice(6, 8));
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayIndex);
  const monday = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
  return { monday, dayIndex };
}

async function getWeekStatsRow(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  monday: string,
): Promise<Doc<"trackableWeekStats"> | null> {
  return await ctx.db
    .query("trackableWeekStats")
    .withIndex("by_trackable_week", (q) =>
      q.eq("trackableId", trackableId).eq("weekMondayYYYYMMDD", monday),
    )
    .unique();
}

/**
 * Records a day's activity flip (totalCount 0 ↔ positive) in the
 * week-level `activeDayMask`. Call from every writer that changes a
 * `trackableDays` row's `numCompleted + attributedTaskCount` across
 * zero. Empty rows (mask 0, no seconds) are garbage-collected.
 */
export async function setTrackableWeekDayActive(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  userId: Id<"users">,
  dayYYYYMMDD: string,
  active: boolean,
): Promise<void> {
  const day = toCompactYYYYMMDD(dayYYYYMMDD);
  if (!isYYYYMMDDCompact(day)) return;
  const { monday, dayIndex } = weekPositionYYYYMMDD(day);
  const bit = 1 << dayIndex;
  const row = await getWeekStatsRow(ctx, trackableId, monday);

  if (active) {
    if (!row) {
      await ctx.db.insert("trackableWeekStats", {
        trackableId,
        userId,
        weekMondayYYYYMMDD: monday,
        activeDayMask: bit,
      });
      return;
    }
    if ((row.activeDayMask & bit) === 0) {
      await ctx.db.patch(row._id, { activeDayMask: row.activeDayMask | bit });
    }
    return;
  }

  if (!row || (row.activeDayMask & bit) === 0) return;
  const nextMask = row.activeDayMask & ~bit;
  const hasSeconds = (row.secondsByDay ?? []).some((s) => s > 0);
  if (nextMask === 0 && !hasSeconds) {
    await ctx.db.delete(row._id);
  } else {
    await ctx.db.patch(row._id, { activeDayMask: nextMask });
  }
}

/**
 * Applies a signed attributed-seconds delta to the week row's
 * `secondsByDay` bucket. Called from `bumpTrackableDaySeconds` so the
 * week rollup mirrors `trackableDaySeconds` exactly.
 */
async function bumpTrackableWeekSeconds(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  userId: Id<"users">,
  dayYYYYMMDD: string,
  deltaSeconds: number,
): Promise<void> {
  if (deltaSeconds === 0) return;
  const day = toCompactYYYYMMDD(dayYYYYMMDD);
  if (!isYYYYMMDDCompact(day)) return;
  const { monday, dayIndex } = weekPositionYYYYMMDD(day);
  const row = await getWeekStatsRow(ctx, trackableId, monday);

  if (!row) {
    if (deltaSeconds <= 0) return;
    const secondsByDay = [0, 0, 0, 0, 0, 0, 0];
    secondsByDay[dayIndex] = deltaSeconds;
    await ctx.db.insert("trackableWeekStats", {
      trackableId,
      userId,
      weekMondayYYYYMMDD: monday,
      activeDayMask: 0,
      secondsByDay,
    });
    return;
  }

  const secondsByDay = [...(row.secondsByDay ?? [0, 0, 0, 0, 0, 0, 0])];
  secondsByDay[dayIndex] = Math.max(0, secondsByDay[dayIndex] + deltaSeconds);
  if (row.activeDayMask === 0 && secondsByDay.every((s) => s === 0)) {
    await ctx.db.delete(row._id);
    return;
  }
  await ctx.db.patch(row._id, { secondsByDay });
}

/**
 * Applies a signed seconds delta to the `(trackableId, dayYYYYMMDD)`
 * bucket in `trackableDaySeconds`. Mirrors the `lifetimeTotalSeconds`
 * window deltas so `getGoalDetails` can compute weekly sums (the
 * `MINUTES_A_WEEK` overall-progress loop) without scanning historical
 * `timeWindows` rows. Rows are created on demand and deleted when the
 * sum returns to zero. `dayYYYYMMDD` must be compact (validated by the
 * callers).
 *
 * A row appearing (0 → +) or disappearing (+ → 0) may flip the day's
 * time-active state, so those transitions also adjust
 * `trackable.lifetimeActiveTimeDayCount` (unless a timed entry keeps
 * the day active independently).
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
      await bumpTrackableWeekSeconds(
        ctx,
        trackableId,
        userId,
        dayYYYYMMDD,
        deltaSeconds,
      );
      if (!(await dayHasTimedEntry(ctx, trackableId, dayYYYYMMDD))) {
        await applyDelta(ctx, trackableId, { activeTimeDayCount: 1 });
      }
    }
    return;
  }

  const next = Math.max(0, existing.attributedSeconds + deltaSeconds);
  if (next === existing.attributedSeconds) return;
  // Keep the week rollup in lockstep with the APPLIED delta (the raw
  // delta may be clamped when it would take the bucket below zero).
  await bumpTrackableWeekSeconds(
    ctx,
    trackableId,
    userId,
    dayYYYYMMDD,
    next - existing.attributedSeconds,
  );
  if (next === 0) {
    await ctx.db.delete(existing._id);
    if (!(await dayHasTimedEntry(ctx, trackableId, dayYYYYMMDD))) {
      await applyDelta(ctx, trackableId, { activeTimeDayCount: -1 });
    }
    return;
  }
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
      // totalCount went 0 → 1: the day became active for the week rollup.
      await setTrackableWeekDayActive(ctx, trackableId, userId, dayYYYYMMDD, true);
    }
    return;
  }

  const next = Math.max(0, (existing.attributedTaskCount ?? 0) + delta);
  const totalBefore = existing.numCompleted + (existing.attributedTaskCount ?? 0);
  const totalAfter = existing.numCompleted + next;
  if (totalBefore > 0 !== totalAfter > 0) {
    await setTrackableWeekDayActive(
      ctx,
      trackableId,
      userId,
      dayYYYYMMDD,
      totalAfter > 0,
    );
  }

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

export type TrackerEntrySnapshot = {
  dayYYYYMMDD: string;
  countValue?: number | null;
  durationSeconds?: number | null;
};

/**
 * Per-day aggregate of one trackable's entries on one compact day,
 * with the written entry itself excluded (so before/after states can
 * be reconstructed by adding the entry's before/after contribution).
 */
async function loadDayEntryBase(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  dayYYYYMMDD: string,
  excludeEntryId: Id<"trackerEntries">,
): Promise<{ countSum: number; countN: number; hasTimed: boolean }> {
  const entries = await ctx.db
    .query("trackerEntries")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackableId).eq("dayYYYYMMDD", dayYYYYMMDD),
    )
    .collect();
  let countSum = 0;
  let countN = 0;
  let hasTimed = false;
  for (const e of entries) {
    if (e._id === excludeEntryId) continue;
    if (e.countValue !== undefined && e.countValue !== null) {
      countSum += e.countValue;
      countN += 1;
    }
    if ((e.durationSeconds ?? 0) > 0) hasTimed = true;
  }
  return { countSum, countN, hasTimed };
}

/**
 * Call after inserting / patching / deleting a `trackerEntries` row —
 * AFTER the row write itself has been applied to the database.
 *
 * Pass `before: null` on insert and `after: null` on delete. Keeps the
 * legacy `lifetime*` entry totals in sync (derived from the snapshot
 * diff) and maintains the daily-average aggregates
 * (`lifetimeActiveTimeDayCount`, `lifetimeCountActiveDayCount`,
 * `lifetimeCountDaySumTotal`, `lifetimeCountDayMeanTotal`) by
 * recomputing the affected day's before/after state from the day's
 * other entries plus this entry's snapshots. Handles entries moving
 * between days (both days are re-evaluated).
 */
export async function onTrackerEntryWrite(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    entryId: Id<"trackerEntries">;
    before: TrackerEntrySnapshot | null;
    after: TrackerEntrySnapshot | null;
  },
): Promise<void> {
  const { trackableId, entryId, before, after } = args;
  const deltaCountValue = (after?.countValue ?? 0) - (before?.countValue ?? 0);
  const deltaDurationSeconds =
    (after?.durationSeconds ?? 0) - (before?.durationSeconds ?? 0);
  const deltaRowCount = (after ? 1 : 0) - (before ? 1 : 0);

  if (
    deltaCountValue !== 0 ||
    deltaDurationSeconds !== 0 ||
    deltaRowCount !== 0 ||
    after?.dayYYYYMMDD !== before?.dayYYYYMMDD
  ) {
    await applyDelta(
      ctx,
      trackableId,
      {
        trackerEntryCount: deltaCountValue,
        trackerEntrySeconds: deltaDurationSeconds,
        trackerEntryRowCount: deltaRowCount,
        // For TRACKER trackables, the entry duration also feeds the
        // overall lifetimeTotalSeconds (mirrors `getGoalDetails`'s
        // `secondsAttributed + (isTracker ? trackerSeconds : 0)`).
        totalSeconds: deltaDurationSeconds,
      },
      after ? toCompactYYYYMMDD(after.dayYYYYMMDD) : undefined,
    );
  }

  // Daily-average aggregates — evaluate each affected day's transition.
  const beforeDay = before ? toCompactYYYYMMDD(before.dayYYYYMMDD) : undefined;
  const afterDay = after ? toCompactYYYYMMDD(after.dayYYYYMMDD) : undefined;
  const days = new Set<string>();
  if (beforeDay && isYYYYMMDDCompact(beforeDay)) days.add(beforeDay);
  if (afterDay && isYYYYMMDDCompact(afterDay)) days.add(afterDay);

  for (const day of days) {
    const base = await loadDayEntryBase(ctx, trackableId, day, entryId);

    const beforeContrib = beforeDay === day ? before : null;
    const afterContrib = afterDay === day ? after : null;

    const beforeHasCount =
      beforeContrib?.countValue !== undefined &&
      beforeContrib?.countValue !== null;
    const afterHasCount =
      afterContrib?.countValue !== undefined &&
      afterContrib?.countValue !== null;

    const beforeSum = base.countSum + (beforeHasCount ? beforeContrib!.countValue! : 0);
    const beforeN = base.countN + (beforeHasCount ? 1 : 0);
    const afterSum = base.countSum + (afterHasCount ? afterContrib!.countValue! : 0);
    const afterN = base.countN + (afterHasCount ? 1 : 0);

    const delta: LifetimePatch = {};

    const beforeActive = beforeN > 0 && beforeSum > 0;
    const afterActive = afterN > 0 && afterSum > 0;
    if (beforeActive || afterActive) {
      delta.countActiveDayCount =
        (afterActive ? 1 : 0) - (beforeActive ? 1 : 0);
      delta.countDaySumTotal =
        (afterActive ? afterSum : 0) - (beforeActive ? beforeSum : 0);
      delta.countDayMeanTotal =
        (afterActive ? afterSum / afterN : 0) -
        (beforeActive ? beforeSum / beforeN : 0);
    }

    // Time-active membership: the day counts when any timed entry OR a
    // positive `trackableDaySeconds` bucket exists. Window seconds are
    // unaffected by an entry write, so only check the bucket when the
    // entry side flipped.
    const beforeTimed =
      base.hasTimed || (beforeContrib?.durationSeconds ?? 0) > 0;
    const afterTimed =
      base.hasTimed || (afterContrib?.durationSeconds ?? 0) > 0;
    if (beforeTimed !== afterTimed) {
      const windowRow = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_trackable_day", (q) =>
          q.eq("trackableId", trackableId).eq("dayYYYYMMDD", day),
        )
        .unique();
      if (!windowRow) {
        delta.activeTimeDayCount = afterTimed ? 1 : -1;
      }
    }

    if (Object.keys(delta).length > 0) {
      await applyDelta(ctx, trackableId, delta);
    }
  }
}
