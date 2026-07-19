/**
 * One-shot backfill for the denormalized trackable lifetime totals
 * added in the bandwidth-reduction pass.
 *
 * After the backfill plus the writer changes in `_helpers/trackableLifetime`,
 * `getGoalDetails` / `getTrackableAnalyticsSeries` can serve all-time
 * numbers straight off the trackable row instead of re-aggregating the
 * entire user's activity history on every reactive fire (previously the
 * single largest contributor to home-page `Reads` bandwidth).
 *
 * Idempotent — running it twice converges to the same final state.
 * Invoked via `npx convex run _admin/backfillTrackableLifetime:runAll`.
 *
 * If totals look wrong after reassigning tasks, run the full repair first:
 *   `npx convex run _admin/repairTrackableLifetime:repairAll`
 * That re-stamps stale window snapshots, then recomputes lifetime totals
 * using coalesce attribution (matching runtime writers).
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  resolveAttributedTrackableId,
  type TaskInfo,
} from "../_helpers/trackableAttribution";

interface ComputedTotals {
  lifetimeTotalSeconds: number;
  lifetimeCalendarCount: number;
  lifetimeStoredDayCount: number;
  lifetimeTrackerEntryCount: number;
  lifetimeTrackerEntrySeconds: number;
  lifetimeTrackerEntryRowCount: number;
  firstActivityDayYYYYMMDD: string | undefined;
}

function liftMinDay(
  current: string | undefined,
  candidate: string | undefined,
): string | undefined {
  if (!candidate) return current;
  if (!current) return candidate;
  return candidate < current ? candidate : current;
}

async function computeTotals(
  ctx: QueryCtx | MutationCtx,
  trackable: Doc<"trackables">,
  linkCache: Map<string, Map<string, Id<"trackables">>>,
  taskCache: Map<string, TaskInfo | null>,
): Promise<ComputedTotals> {
  let listMap = linkCache.get(trackable.userId);
  if (!listMap) {
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", trackable.userId))
      .collect();
    listMap = buildListIdToTrackableId(links);
    linkCache.set(trackable.userId, listMap);
  }

  // Coalesce attribution across all ACTUAL windows for this user.
  const userWindows = await ctx.db
    .query("timeWindows")
    .withIndex("by_user", (q) => q.eq("userId", trackable.userId))
    .collect();

  let lifetimeCalendarSeconds = 0;
  let lifetimeCalendarCount = 0;
  let firstActivity: string | undefined;
  for (const w of userWindows) {
    if (w.budgetType !== "ACTUAL") continue;
    let taskInfo: TaskInfo | null = null;
    if (w.taskId) {
      const key = String(w.taskId);
      if (!taskCache.has(key)) {
        const task = await ctx.db.get(w.taskId);
        taskCache.set(
          key,
          task
            ? {
                trackableId: task.trackableId ?? null,
                listId: task.listId ?? null,
              }
            : null,
        );
      }
      taskInfo = taskCache.get(key) ?? null;
    }
    const taskInfoMap = new Map<string, TaskInfo>();
    if (w.taskId && taskInfo) taskInfoMap.set(String(w.taskId), taskInfo);
    const attributed =
      resolveAttributedTrackableId(w, taskInfoMap, listMap) ?? undefined;
    if (attributed !== trackable._id) continue;
    lifetimeCalendarSeconds += w.durationSeconds ?? 0;
    lifetimeCalendarCount += 1;
    firstActivity = liftMinDay(firstActivity, w.startDayYYYYMMDD);
  }

  // Stored day counts (does NOT include task-completion contributions —
  // those stay dynamic, mirroring `getGoalDetails`).
  const trackableDays = await ctx.db
    .query("trackableDays")
    .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
    .collect();
  let lifetimeStoredDayCount = 0;
  for (const d of trackableDays) {
    lifetimeStoredDayCount += d.numCompleted ?? 0;
    if ((d.numCompleted ?? 0) > 0) {
      firstActivity = liftMinDay(firstActivity, d.dayYYYYMMDD);
    }
  }

  // Tracker entries (TRACKER trackables only — for other types this
  // returns an empty list).
  const entries = await ctx.db
    .query("trackerEntries")
    .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
    .collect();
  let lifetimeTrackerEntryCount = 0;
  let lifetimeTrackerEntrySeconds = 0;
  for (const e of entries) {
    lifetimeTrackerEntryCount += e.countValue ?? 0;
    lifetimeTrackerEntrySeconds += e.durationSeconds ?? 0;
    firstActivity = liftMinDay(firstActivity, e.dayYYYYMMDD);
  }
  const lifetimeTrackerEntryRowCount = entries.length;

  // Mirror `getGoalDetails`'s TRACKER-aware seconds fold:
  // `secondsAttributed + (isTracker ? trackerSeconds : 0)`.
  const isTracker = trackable.trackableType === "TRACKER";
  const lifetimeTotalSeconds =
    lifetimeCalendarSeconds + (isTracker ? lifetimeTrackerEntrySeconds : 0);

  return {
    lifetimeTotalSeconds,
    lifetimeCalendarCount,
    lifetimeStoredDayCount,
    lifetimeTrackerEntryCount,
    lifetimeTrackerEntrySeconds,
    lifetimeTrackerEntryRowCount,
    firstActivityDayYYYYMMDD: firstActivity,
  };
}

/**
 * Compute totals for ALL of one user's trackables in a single pass over
 * that user's `timeWindows`. The per-trackable `computeTotals` re-collects
 * the user's full window history once per trackable, which multiplies to
 * `trackables × windows` document reads and blows the 32k per-execution
 * read limit on real post-migration data (48 × ~2,450). One pass keeps
 * reads at `windows + tasks + small per-trackable tables`.
 */
async function computeTotalsForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  trackables: Doc<"trackables">[],
  taskCache: Map<string, TaskInfo | null>,
): Promise<Map<string, ComputedTotals>> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const listMap = buildListIdToTrackableId(links);

  const userWindows = await ctx.db
    .query("timeWindows")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const calendarSeconds = new Map<string, number>();
  const calendarCount = new Map<string, number>();
  const firstActivity = new Map<string, string>();
  const liftActivity = (trackableId: string, day: string | undefined) => {
    if (!day) return;
    const current = firstActivity.get(trackableId);
    if (!current || day < current) firstActivity.set(trackableId, day);
  };

  for (const w of userWindows) {
    if (w.budgetType !== "ACTUAL") continue;
    let taskInfo: TaskInfo | null = null;
    if (w.taskId) {
      const key = String(w.taskId);
      if (!taskCache.has(key)) {
        const task = await ctx.db.get(w.taskId);
        taskCache.set(
          key,
          task
            ? {
                trackableId: task.trackableId ?? null,
                listId: task.listId ?? null,
              }
            : null,
        );
      }
      taskInfo = taskCache.get(key) ?? null;
    }
    const taskInfoMap = new Map<string, TaskInfo>();
    if (w.taskId && taskInfo) taskInfoMap.set(String(w.taskId), taskInfo);
    const attributed = resolveAttributedTrackableId(w, taskInfoMap, listMap);
    if (!attributed) continue;
    const key = String(attributed);
    calendarSeconds.set(
      key,
      (calendarSeconds.get(key) ?? 0) + (w.durationSeconds ?? 0),
    );
    calendarCount.set(key, (calendarCount.get(key) ?? 0) + 1);
    liftActivity(key, w.startDayYYYYMMDD);
  }

  const out = new Map<string, ComputedTotals>();
  for (const trackable of trackables) {
    const key = String(trackable._id);

    const trackableDays = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
      .collect();
    let lifetimeStoredDayCount = 0;
    for (const d of trackableDays) {
      lifetimeStoredDayCount += d.numCompleted ?? 0;
      if ((d.numCompleted ?? 0) > 0) liftActivity(key, d.dayYYYYMMDD);
    }

    const entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
      .collect();
    let lifetimeTrackerEntryCount = 0;
    let lifetimeTrackerEntrySeconds = 0;
    for (const e of entries) {
      lifetimeTrackerEntryCount += e.countValue ?? 0;
      lifetimeTrackerEntrySeconds += e.durationSeconds ?? 0;
      liftActivity(key, e.dayYYYYMMDD);
    }

    const isTracker = trackable.trackableType === "TRACKER";
    out.set(key, {
      lifetimeTotalSeconds:
        (calendarSeconds.get(key) ?? 0) +
        (isTracker ? lifetimeTrackerEntrySeconds : 0),
      lifetimeCalendarCount: calendarCount.get(key) ?? 0,
      lifetimeStoredDayCount,
      lifetimeTrackerEntryCount,
      lifetimeTrackerEntrySeconds,
      lifetimeTrackerEntryRowCount: entries.length,
      firstActivityDayYYYYMMDD: firstActivity.get(key),
    });
  }
  return out;
}

function groupByUser(
  trackables: Doc<"trackables">[],
): Map<Id<"users">, Doc<"trackables">[]> {
  const byUser = new Map<Id<"users">, Doc<"trackables">[]>();
  for (const t of trackables) {
    const bucket = byUser.get(t.userId);
    if (bucket) bucket.push(t);
    else byUser.set(t.userId, [t]);
  }
  return byUser;
}

function differs(
  current: Doc<"trackables">,
  next: ComputedTotals,
): boolean {
  return (
    (current.lifetimeTotalSeconds ?? 0) !== next.lifetimeTotalSeconds ||
    (current.lifetimeCalendarCount ?? 0) !== next.lifetimeCalendarCount ||
    (current.lifetimeStoredDayCount ?? 0) !== next.lifetimeStoredDayCount ||
    (current.lifetimeTrackerEntryCount ?? 0) !==
      next.lifetimeTrackerEntryCount ||
    (current.lifetimeTrackerEntrySeconds ?? 0) !==
      next.lifetimeTrackerEntrySeconds ||
    (current.lifetimeTrackerEntryRowCount ?? 0) !==
      next.lifetimeTrackerEntryRowCount ||
    current.firstActivityDayYYYYMMDD !== next.firstActivityDayYYYYMMDD
  );
}

export const runAll = internalMutation({
  args: {
    /** Restrict to one user (for chunked runs on large datasets). */
    userId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const trackables = await ctx.db.query("trackables").collect();
    const byUser = groupByUser(
      args.userId
        ? trackables.filter((t) => t.userId === args.userId)
        : trackables,
    );
    const taskCache = new Map<string, TaskInfo | null>();
    let total = 0;
    let patched = 0;
    for (const [userId, userTrackables] of byUser) {
      const totals = await computeTotalsForUser(
        ctx,
        userId,
        userTrackables,
        taskCache,
      );
      for (const trackable of userTrackables) {
        total++;
        const next = totals.get(String(trackable._id));
        if (!next || !differs(trackable, next)) continue;
        await ctx.db.patch(trackable._id, next);
        patched++;
      }
    }
    return { total, patched };
  },
});

/** Read-only audit so we can verify the writers stay in sync. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    const byUser = groupByUser(trackables);
    const taskCache = new Map<string, TaskInfo | null>();
    let pending = 0;
    let upToDate = 0;
    for (const [userId, userTrackables] of byUser) {
      const totals = await computeTotalsForUser(
        ctx,
        userId,
        userTrackables,
        taskCache,
      );
      for (const trackable of userTrackables) {
        const next = totals.get(String(trackable._id));
        if (next && differs(trackable, next)) pending++;
        else upToDate++;
      }
    }
    return { totalTrackables: trackables.length, upToDate, pending };
  },
});

/**
 * Single-trackable variant — useful for spot-checks after a writer
 * change. Returns both the stored value and the recomputed canonical
 * value so the caller can compare.
 */
export const debugSingle = internalQuery({
  args: { id: v.id("trackables") },
  handler: async (ctx, args) => {
    const trackable = await ctx.db.get(args.id);
    if (!trackable) return null;
    const recomputed = await computeTotals(
      ctx,
      trackable,
      new Map(),
      new Map(),
    );
    return {
      stored: {
        lifetimeTotalSeconds: trackable.lifetimeTotalSeconds ?? null,
        lifetimeCalendarCount: trackable.lifetimeCalendarCount ?? null,
        lifetimeStoredDayCount: trackable.lifetimeStoredDayCount ?? null,
        lifetimeTrackerEntryCount:
          trackable.lifetimeTrackerEntryCount ?? null,
        lifetimeTrackerEntrySeconds:
          trackable.lifetimeTrackerEntrySeconds ?? null,
        lifetimeTrackerEntryRowCount:
          trackable.lifetimeTrackerEntryRowCount ?? null,
        firstActivityDayYYYYMMDD:
          trackable.firstActivityDayYYYYMMDD ?? null,
      },
      recomputed,
    };
  },
});
