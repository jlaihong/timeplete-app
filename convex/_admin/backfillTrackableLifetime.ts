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
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

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
): Promise<ComputedTotals> {
  // Trackable-attributed timer/calendar windows (the snapshot
  // `trackableId` is what writers maintain).
  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
    .collect();
  const actualWindows = windows.filter((w) => w.budgetType === "ACTUAL");

  let lifetimeCalendarSeconds = 0;
  let firstActivity: string | undefined;
  for (const w of actualWindows) {
    lifetimeCalendarSeconds += w.durationSeconds ?? 0;
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
    lifetimeCalendarCount: actualWindows.length,
    lifetimeStoredDayCount,
    lifetimeTrackerEntryCount,
    lifetimeTrackerEntrySeconds,
    lifetimeTrackerEntryRowCount,
    firstActivityDayYYYYMMDD: firstActivity,
  };
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
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    let patched = 0;
    for (const trackable of trackables) {
      const next = await computeTotals(ctx, trackable);
      if (!differs(trackable, next)) continue;
      await ctx.db.patch(trackable._id, next);
      patched++;
    }
    return { total: trackables.length, patched };
  },
});

/** Read-only audit so we can verify the writers stay in sync. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    let pending = 0;
    let upToDate = 0;
    for (const trackable of trackables) {
      const next = await computeTotals(ctx, trackable);
      if (differs(trackable, next)) pending++;
      else upToDate++;
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
    const recomputed = await computeTotals(ctx, trackable);
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
