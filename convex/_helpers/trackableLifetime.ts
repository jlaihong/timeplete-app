/**
 * Keeps every trackable's totals up to date as tasks, time windows and
 * hand-logged entries change, so the home, trackable and analytics screens
 * read small precomputed rows instead of re-adding a user's history.
 *
 * What an item counts toward is a SET of trackables (allocation, rules,
 * its task, and every ancestor): see `trackableMembership.ts`. For each
 * trackable in that set this file maintains
 *
 *   trackable.lifetimeTotalSeconds / lifetimeCalendarCount
 *       ACTUAL window seconds and window count (plus, for hand-logged
 *       entries on the trackable itself, their seconds);
 *   trackableDaySeconds / trackableWeekStats.secondsByDay
 *       the same seconds per day and per week;
 *   trackable.lifetimeAttributedTaskDayCount, trackableDays.attributedTaskCount,
 *   trackableWeekStats.activeDayMask
 *       completed tasks, in total, per day, and as "active day" bits;
 *   trackable.firstActivityDayYYYYMMDD
 *       the earliest day with any of the above.
 *
 * and, for the trackable an entry or check-in was logged on, the
 * `lifetimeStoredDayCount` / `lifetimeTrackerEntry*` / daily-average
 * fields.
 *
 * Credit is exact because each row records who was credited for it
 * (`attributedTrackableIds`): `syncWindowAttribution` and
 * `syncTaskAttribution` take back what the stamp says and add what the
 * row counts toward now. Call them after any write to a window or a
 * task; they are safe to repeat, which is what lets rule and tree changes
 * be applied by re-running them over history (`trackableResync.ts`).
 *
 * Rows saved before stamps existed were credited to one trackable under
 * the old rule (window tag, else task tag, else the list's trackable);
 * `creditedWindowIds` / `creditedTaskIds` fall back to that until
 * `trackableResync:runForAllUsers` has stamped them.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { TaskInfo } from "./trackableAttribution";
import { setManualItems, setTrackableItems } from "./trackableItems";
import {
  allocatedTrackableIds,
  listRuleTrackableIds,
  newMembershipCache,
  resolveTaskTrackableIds,
  resolveWindowTrackableIds,
  sameTrackableSet,
  type MembershipCache,
} from "./trackableMembership";
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
> &
  Pick<Doc<"timeWindows">, "attributedTrackableIds">;

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
  /** +1 / -1 when a whole window is added or taken back. */
  deltaEvents: number,
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
        eventCount: Math.max(0, deltaEvents),
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
  await ctx.db.patch(existing._id, {
    attributedSeconds: next,
    // A row from before the count existed stood for at least one event.
    eventCount: Math.max(0, (existing.eventCount ?? 1) + deltaEvents),
  });
}

/* ── Attribution: who gets credit for a window or a completed task ────── */

/**
 * Extra facts for rows written before `attributedTrackableIds` existed.
 * Such a row was credited to ONE trackable under the old rule
 * (window tag, else task tag, else the list's linked trackable), and that
 * is what has to be taken back. When the caller is in the middle of
 * changing the task or the list link, it passes the state from BEFORE the
 * change so the old credit is found exactly.
 */
export type LegacyHints = {
  task?: TaskInfo | null;
  listLinkBefore?: {
    listId: Id<"lists">;
    trackableId: Id<"trackables"> | undefined;
  };
};

async function legacyListTrackableId(
  ctx: MutationCtx,
  cache: MembershipCache,
  userId: Id<"users">,
  listId: Id<"lists"> | null | undefined,
  hints: LegacyHints | undefined,
): Promise<Id<"trackables"> | undefined> {
  if (!listId) return undefined;
  if (hints?.listLinkBefore && hints.listLinkBefore.listId === listId) {
    return hints.listLinkBefore.trackableId;
  }
  return (await listRuleTrackableIds(ctx, cache, userId, listId))[0];
}

/** The trackables a window is currently credited to. */
async function creditedWindowIds(
  ctx: MutationCtx,
  cache: MembershipCache,
  tw: WindowLifetimeRow,
  hints: LegacyHints | undefined,
): Promise<Id<"trackables">[]> {
  if (tw.attributedTrackableIds) return tw.attributedTrackableIds;
  if (tw.trackableId) return [tw.trackableId];
  if (tw.taskId) {
    const info =
      hints?.task !== undefined
        ? hints.task
        : await loadTaskInfoForWindow(ctx, tw.taskId);
    if (info) {
      if (info.trackableId) return [info.trackableId];
      const viaList = await legacyListTrackableId(
        ctx,
        cache,
        tw.userId,
        info.listId,
        hints,
      );
      if (viaList) return [viaList];
    }
  }
  const viaWindowList = await legacyListTrackableId(
    ctx,
    cache,
    tw.userId,
    tw.listId,
    hints,
  );
  return viaWindowList ? [viaWindowList] : [];
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

/** Add (`sign` 1) or take back (-1) a window's time for each trackable. */
async function applyWindowCredit(
  ctx: MutationCtx,
  tw: Pick<
    WindowLifetimeRow,
    "userId" | "budgetType" | "durationSeconds" | "startDayYYYYMMDD"
  >,
  trackableIds: readonly Id<"trackables">[],
  sign: 1 | -1,
): Promise<void> {
  if (tw.budgetType !== "ACTUAL") return;
  const dur = tw.durationSeconds ?? 0;
  if (dur <= 0) return;
  const day = toCompactYYYYMMDD(tw.startDayYYYYMMDD);
  const activityDay = isYYYYMMDDCompact(day) ? day : undefined;
  for (const trackableId of trackableIds) {
    await applyDelta(
      ctx,
      trackableId,
      { totalSeconds: sign * dur, calendarCount: sign },
      sign > 0 ? activityDay : undefined,
    );
    if (activityDay) {
      await bumpTrackableDaySeconds(
        ctx,
        trackableId,
        tw.userId,
        activityDay,
        sign * dur,
        sign,
      );
    }
  }
}

function sameOrder(
  a: readonly string[] | undefined,
  b: readonly string[],
): boolean {
  return !!a && a.length === b.length && a.every((id, i) => id === b[i]);
}

export type SyncOptions = {
  cache?: MembershipCache;
  legacy?: LegacyHints;
  /**
   * For a window logged on a task: reset the window's own `trackableId`
   * to the task's trackable (the task's tag, else its list's). Used when
   * the task's tags or its list's rule changed, so the window follows.
   */
  resnapshot?: boolean;
};

/**
 * Bring a time window's credit in line with what it counts toward now.
 * Call after ANY write to the row, passing the row as it was before the
 * write (`null` for a new row). Safe to call again at any time: it applies
 * only the difference between what was credited and what should be.
 */
export async function syncWindowAttribution(
  ctx: MutationCtx,
  windowId: Id<"timeWindows">,
  before: WindowLifetimeRow | null,
  opts: SyncOptions = {},
): Promise<void> {
  const cache = opts.cache ?? newMembershipCache();
  let tw = await ctx.db.get(windowId);
  if (!tw) {
    if (before) {
      await setTrackableItems(
        ctx,
        { kind: "event", windowId },
        before.userId,
        [],
        undefined,
      );
      await applyWindowCredit(
        ctx,
        before,
        await creditedWindowIds(ctx, cache, before, opts.legacy),
        -1,
      );
    }
    return;
  }
  const prevIds = before
    ? await creditedWindowIds(ctx, cache, before, opts.legacy)
    : [];

  const task = tw.taskId ? await ctx.db.get(tw.taskId) : null;
  if (opts.resnapshot && task && tw.activityType === "TASK") {
    const snapshot =
      allocatedTrackableIds(task)[0] ??
      (await listRuleTrackableIds(ctx, cache, task.userId, task.listId))[0];
    if (tw.trackableId !== snapshot) {
      await ctx.db.patch(tw._id, { trackableId: snapshot });
      tw = { ...tw, trackableId: snapshot };
    }
  }
  const nextIds = await resolveWindowTrackableIds(ctx, cache, tw, task);

  const unchanged =
    before !== null &&
    sameTrackableSet(prevIds, nextIds) &&
    before.budgetType === tw.budgetType &&
    (before.durationSeconds ?? 0) === (tw.durationSeconds ?? 0) &&
    toCompactYYYYMMDD(before.startDayYYYYMMDD) ===
      toCompactYYYYMMDD(tw.startDayYYYYMMDD);
  if (!unchanged) {
    if (before) await applyWindowCredit(ctx, before, prevIds, -1);
    await applyWindowCredit(ctx, tw, nextIds, 1);
  }
  if (!sameOrder(tw.attributedTrackableIds, nextIds)) {
    await ctx.db.patch(tw._id, { attributedTrackableIds: nextIds });
  }
  // "What counted" lists the window under each of them, when it counts.
  await setTrackableItems(
    ctx,
    { kind: "event", windowId: tw._id },
    tw.userId,
    tw.budgetType === "ACTUAL" && (tw.durationSeconds ?? 0) > 0 ? nextIds : [],
    tw.startDayYYYYMMDD,
  );
}

/** Call after inserting a `timeWindows` row. */
export async function onAttributedWindowInserted(
  ctx: MutationCtx,
  windowId: Id<"timeWindows">,
): Promise<void> {
  await syncWindowAttribution(ctx, windowId, null);
}

/** Call after deleting a `timeWindows` row. */
export async function onAttributedWindowDeleted(
  ctx: MutationCtx,
  tw: WindowLifetimeRow,
): Promise<void> {
  const cache = newMembershipCache();
  await applyWindowCredit(
    ctx,
    tw,
    await creditedWindowIds(ctx, cache, tw, undefined),
    -1,
  );
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
  await setTrackableItems(
    ctx,
    { kind: "event", windowId: tw._id },
    tw.userId,
    [],
    undefined,
  );
  await onTimeWindowDeleted(ctx, {
    taskId: tw.taskId,
    subtaskId: tw.subtaskId,
    activityType: tw.activityType,
    budgetType: tw.budgetType,
    durationSeconds: tw.durationSeconds,
  });
  await onAttributedWindowDeleted(ctx, tw);
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

/** The task fields that decide completion credit. */
export type TaskCreditRow = Pick<
  Doc<"tasks">,
  "userId" | "dateCompleted" | "trackableId" | "listId" | "attributedTrackableIds"
>;

/** The trackables a completed task is currently credited to. */
async function creditedTaskIds(
  ctx: MutationCtx,
  cache: MembershipCache,
  task: TaskCreditRow,
  hints: LegacyHints | undefined,
): Promise<Id<"trackables">[]> {
  if (!task.dateCompleted) return [];
  if (task.attributedTrackableIds) return task.attributedTrackableIds;
  if (task.trackableId) return [task.trackableId];
  const viaList = await legacyListTrackableId(
    ctx,
    cache,
    task.userId,
    task.listId,
    hints,
  );
  return viaList ? [viaList] : [];
}

/** Add or take back "one completed task on that day" for each trackable. */
async function applyTaskCompletionCredit(
  ctx: MutationCtx,
  task: Pick<Doc<"tasks">, "userId" | "dateCompleted">,
  trackableIds: readonly Id<"trackables">[],
  sign: 1 | -1,
): Promise<void> {
  if (!task.dateCompleted) return;
  const day = toCompactYYYYMMDD(task.dateCompleted);
  const validDay = isYYYYMMDDCompact(day) ? day : undefined;
  for (const trackableId of trackableIds) {
    await applyDelta(
      ctx,
      trackableId,
      { attributedTaskDayCount: sign },
      sign > 0 ? validDay : undefined,
    );
    if (validDay) {
      await bumpTrackableDayAttributedTaskCount(
        ctx,
        trackableId,
        task.userId,
        validDay,
        sign,
      );
    }
  }
}

/**
 * Bring a task's completion credit, its stamp and (when what it counts
 * toward changed) its time windows in line with the task as it is now.
 * Call after any write that touches the task's name, trackable, list or
 * completion, passing the row as it was before (`null` for a new task).
 * Safe to repeat.
 */
export async function syncTaskAttribution(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  before: TaskCreditRow | null,
  opts: SyncOptions & { skipWindows?: boolean } = {},
): Promise<void> {
  const cache = opts.cache ?? newMembershipCache();
  const task = await ctx.db.get(taskId);
  if (!task) {
    if (before) {
      await removeTaskCompletionCredit(ctx, { ...before, _id: taskId });
    }
    return;
  }
  const prevIds = before
    ? await creditedTaskIds(ctx, cache, before, opts.legacy)
    : [];
  const allIds = await resolveTaskTrackableIds(ctx, cache, task);
  const nextIds = task.dateCompleted ? allIds : [];

  if (
    !sameTrackableSet(prevIds, nextIds) ||
    (before?.dateCompleted ?? undefined) !== (task.dateCompleted ?? undefined)
  ) {
    if (before) await applyTaskCompletionCredit(ctx, before, prevIds, -1);
    await applyTaskCompletionCredit(ctx, task, nextIds, 1);
  }
  if (!sameOrder(task.attributedTrackableIds, allIds)) {
    await ctx.db.patch(task._id, { attributedTrackableIds: allIds });
  }
  // "What counted" lists a completed task on the day it was completed.
  await setTrackableItems(
    ctx,
    { kind: "task", taskId: task._id },
    task.userId,
    nextIds,
    task.dateCompleted,
  );

  // The task's windows count toward whatever the task does. Re-sync them
  // when that changed (or was never recorded for this task).
  const membershipChanged =
    before !== null &&
    (before.attributedTrackableIds === undefined ||
      !sameTrackableSet(before.attributedTrackableIds, allIds));
  if (opts.skipWindows || !membershipChanged) return;
  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .take(2000);
  for (const w of windows) {
    await syncWindowAttribution(ctx, w._id, w, {
      cache,
      resnapshot: true,
      legacy: {
        ...opts.legacy,
        task: {
          trackableId: before?.trackableId ?? null,
          listId: before?.listId ?? null,
        },
      },
    });
  }
}

/** Call when a task row is deleted (pass the row as it was). */
export async function removeTaskCompletionCredit(
  ctx: MutationCtx,
  task: TaskCreditRow & { _id?: Id<"tasks"> },
): Promise<void> {
  if (task._id) {
    await setTrackableItems(
      ctx,
      { kind: "task", taskId: task._id },
      task.userId,
      [],
      undefined,
    );
  }
  const cache = newMembershipCache();
  await applyTaskCompletionCredit(
    ctx,
    task,
    await creditedTaskIds(ctx, cache, task, undefined),
    -1,
  );
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
  await setManualItems(
    ctx,
    { kind: "value", entryId },
    trackableId,
    after?.dayYYYYMMDD,
    after !== null,
  );
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
