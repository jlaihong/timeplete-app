/**
 * One-shot backfill for the daily-average aggregates on `trackables`:
 *
 *   lifetimeActiveTimeDayCount   — distinct days with a positive
 *                                  `trackableDaySeconds` bucket OR a
 *                                  timed tracker entry
 *   lifetimeCountActiveDayCount  — days whose entry countValue sum > 0
 *   lifetimeCountDaySumTotal     — Σ per-day countValue sums (active days)
 *   lifetimeCountDayMeanTotal    — Σ per-day countValue means (active days)
 *
 * After this runs, `getGoalDetails` serves the TRACKER daily averages
 * straight off the trackable doc instead of scanning the trackable's
 * full `trackerEntries` history + every `trackableDaySeconds` row on
 * each reactive fire (~150-200 KB/execution on migrated data).
 *
 * `lifetimeActiveTimeDayCount === undefined` is the "not yet seeded"
 * sentinel: the readers fall back to the legacy scan and the
 * incremental writers in `_helpers/trackableLifetime` skip these four
 * fields until the seed exists (all four are set together here).
 *
 * Idempotent — running it twice converges to the same final state.
 * Invoked via `npx convex run _admin/backfillTrackerAverages:runAll`.
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { toCompactYYYYMMDD } from "../_helpers/compactYYYYMMDD";

type Aggregates = {
  activeTimeDayCount: number;
  countActiveDayCount: number;
  countDaySumTotal: number;
  countDayMeanTotal: number;
};

async function computeForTrackable(
  ctx: QueryCtx | MutationCtx,
  trackable: Doc<"trackables">,
): Promise<Aggregates> {
  const entries = await ctx.db
    .query("trackerEntries")
    .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
    .collect();
  const daySecondsRows = await ctx.db
    .query("trackableDaySeconds")
    .withIndex("by_trackable_day", (q) => q.eq("trackableId", trackable._id))
    .collect();

  const timedDays = new Set<string>();
  for (const r of daySecondsRows) {
    if (r.attributedSeconds > 0) timedDays.add(r.dayYYYYMMDD);
  }

  const perDayCount = new Map<string, { sum: number; n: number }>();
  for (const e of entries) {
    const day = toCompactYYYYMMDD(e.dayYYYYMMDD);
    if ((e.durationSeconds ?? 0) > 0) timedDays.add(day);
    if (e.countValue === undefined || e.countValue === null) continue;
    const agg = perDayCount.get(day) ?? { sum: 0, n: 0 };
    agg.sum += e.countValue;
    agg.n += 1;
    perDayCount.set(day, agg);
  }

  let countActiveDayCount = 0;
  let countDaySumTotal = 0;
  let countDayMeanTotal = 0;
  for (const { sum, n } of perDayCount.values()) {
    if (sum <= 0) continue;
    countActiveDayCount += 1;
    countDaySumTotal += sum;
    countDayMeanTotal += sum / n;
  }

  return {
    activeTimeDayCount: timedDays.size,
    countActiveDayCount,
    countDaySumTotal,
    countDayMeanTotal,
  };
}

/** Float drift tolerance for the mean-sum (see `auditPending`). */
const EPSILON = 1e-6;

function matches(t: Doc<"trackables">, agg: Aggregates): boolean {
  return (
    t.lifetimeActiveTimeDayCount === agg.activeTimeDayCount &&
    (t.lifetimeCountActiveDayCount ?? 0) === agg.countActiveDayCount &&
    Math.abs((t.lifetimeCountDaySumTotal ?? 0) - agg.countDaySumTotal) <
      EPSILON &&
    Math.abs((t.lifetimeCountDayMeanTotal ?? 0) - agg.countDayMeanTotal) <
      EPSILON
  );
}

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    let seeded = 0;
    let corrected = 0;
    let upToDate = 0;
    for (const t of trackables) {
      const agg = await computeForTrackable(ctx, t);
      if (matches(t, agg)) {
        upToDate++;
        continue;
      }
      if (t.lifetimeActiveTimeDayCount === undefined) seeded++;
      else corrected++;
      await ctx.db.patch(t._id, {
        lifetimeActiveTimeDayCount: agg.activeTimeDayCount,
        lifetimeCountActiveDayCount: agg.countActiveDayCount,
        lifetimeCountDaySumTotal: agg.countDaySumTotal,
        lifetimeCountDayMeanTotal: agg.countDayMeanTotal,
      });
    }
    return { trackables: trackables.length, seeded, corrected, upToDate };
  },
});

/** Read-only audit so we can verify the writers stay in sync. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    let pending = 0;
    let upToDate = 0;
    const drifted: Array<{
      trackableId: string;
      name: string;
      stored: Record<string, number | undefined>;
      expected: Aggregates;
    }> = [];
    for (const t of trackables) {
      const agg = await computeForTrackable(ctx, t);
      if (matches(t, agg)) {
        upToDate++;
        continue;
      }
      pending++;
      if (drifted.length < 20) {
        drifted.push({
          trackableId: String(t._id),
          name: t.name,
          stored: {
            activeTimeDayCount: t.lifetimeActiveTimeDayCount,
            countActiveDayCount: t.lifetimeCountActiveDayCount,
            countDaySumTotal: t.lifetimeCountDaySumTotal,
            countDayMeanTotal: t.lifetimeCountDayMeanTotal,
          },
          expected: agg,
        });
      }
    }
    return { pending, upToDate, drifted };
  },
});
