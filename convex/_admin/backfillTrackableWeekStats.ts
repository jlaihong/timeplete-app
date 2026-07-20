/**
 * One-time seed of the `trackableWeekStats` rollup table (see schema
 * doc) from existing `trackableDays` + `trackableDaySeconds` rows.
 *
 * Idempotent: deletes any existing rollup rows for the trackable
 * before re-inserting, then stamps `trackable.weekStatsSeeded = true`
 * so `getGoalDetails` switches to the rollup read path.
 *
 * Run with: npx convex run _admin/backfillTrackableWeekStats:runAll [--prod]
 */
import { internalMutation } from "../_generated/server";
import { toCompactYYYYMMDD, isYYYYMMDDCompact } from "../_helpers/compactYYYYMMDD";
import { weekPositionYYYYMMDD } from "../_helpers/trackableLifetime";

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const trackables = await ctx.db.query("trackables").collect();
    let seeded = 0;
    let rowsInserted = 0;

    for (const trackable of trackables) {
      const existing = await ctx.db
        .query("trackableWeekStats")
        .withIndex("by_trackable_week", (q) =>
          q.eq("trackableId", trackable._id),
        )
        .collect();
      for (const row of existing) await ctx.db.delete(row._id);

      type WeekAgg = { activeDayMask: number; secondsByDay?: number[] };
      const byMonday = new Map<string, WeekAgg>();
      const getWeek = (monday: string): WeekAgg => {
        let w = byMonday.get(monday);
        if (!w) {
          w = { activeDayMask: 0 };
          byMonday.set(monday, w);
        }
        return w;
      };

      const dayRows = await ctx.db
        .query("trackableDays")
        .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
        .collect();
      // Aggregate totalCount per compact day first — legacy data may
      // hold multiple rows for one day in mixed formats.
      const totalByDay = new Map<string, number>();
      for (const d of dayRows) {
        const day = toCompactYYYYMMDD(d.dayYYYYMMDD);
        if (!isYYYYMMDDCompact(day)) continue;
        totalByDay.set(
          day,
          (totalByDay.get(day) ?? 0) +
            d.numCompleted +
            (d.attributedTaskCount ?? 0),
        );
      }
      for (const [day, total] of totalByDay) {
        if (total <= 0) continue;
        const { monday, dayIndex } = weekPositionYYYYMMDD(day);
        getWeek(monday).activeDayMask |= 1 << dayIndex;
      }

      const secondsRows = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_trackable_day", (q) =>
          q.eq("trackableId", trackable._id),
        )
        .collect();
      for (const r of secondsRows) {
        const day = toCompactYYYYMMDD(r.dayYYYYMMDD);
        if (!isYYYYMMDDCompact(day)) continue;
        if (r.attributedSeconds <= 0) continue;
        const { monday, dayIndex } = weekPositionYYYYMMDD(day);
        const week = getWeek(monday);
        if (!week.secondsByDay) week.secondsByDay = [0, 0, 0, 0, 0, 0, 0];
        week.secondsByDay[dayIndex] += r.attributedSeconds;
      }

      for (const [monday, week] of byMonday) {
        if (week.activeDayMask === 0 && !week.secondsByDay) continue;
        await ctx.db.insert("trackableWeekStats", {
          trackableId: trackable._id,
          userId: trackable.userId,
          weekMondayYYYYMMDD: monday,
          activeDayMask: week.activeDayMask,
          ...(week.secondsByDay ? { secondsByDay: week.secondsByDay } : {}),
        });
        rowsInserted++;
      }

      await ctx.db.patch(trackable._id, { weekStatsSeeded: true });
      seeded++;
    }

    return { trackablesSeeded: seeded, weekRowsInserted: rowsInserted };
  },
});
