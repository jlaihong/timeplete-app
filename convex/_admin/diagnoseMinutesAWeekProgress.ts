/**
 * Parity diagnostic for the `MINUTES_A_WEEK` overall-progress rewrite
 * (raw-window scan → denormalized `trackableDaySeconds` rows).
 *
 * `compare` recomputes `periodicOverallProgress` for every
 * `MINUTES_A_WEEK` trackable both ways:
 *
 *   legacy — the exact pre-rewrite `getGoalDetails` computation: scan
 *            `timeWindows` from the trackable's start day with union
 *            attribution (`timeWindowAttributedToTrackable`).
 *   next   — the post-rewrite computation: per-day sums from
 *            `trackableDaySeconds` (requires
 *            `_admin/backfillTrackableDaySeconds:runAll` to have run).
 *
 * Run with a client-realistic `today` (compact YYYYMMDD):
 *   npx convex run _admin/diagnoseMinutesAWeekProgress:compare '{"today":"20260718"}'
 *
 * diffCount must be 0 before trusting the rewrite in production.
 */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  timeWindowAttributedToTrackable,
  type TaskInfo,
} from "../_helpers/trackableAttribution";
import {
  isYYYYMMDDCompact,
  toCompactYYYYMMDD,
} from "../_helpers/compactYYYYMMDD";

function startOfWeekYYYYMMDD(yyyymmdd: string): string {
  const y = parseInt(yyyymmdd.substring(0, 4));
  const m = parseInt(yyyymmdd.substring(4, 6)) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8));
  const date = new Date(y, m, d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const yy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function addDaysYYYYMMDD(yyyymmdd: string, days: number): string {
  const y = parseInt(yyyymmdd.substring(0, 4));
  const m = parseInt(yyyymmdd.substring(4, 6)) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8));
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

export const compare = internalQuery({
  args: {
    /** Compact YYYYMMDD — the client-side "today" the widgets pass. */
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const today = toCompactYYYYMMDD(args.today);
    const trackables = await ctx.db.query("trackables").collect();
    const minutesAWeek = trackables.filter(
      (t) => t.trackableType === "MINUTES_A_WEEK",
    );

    const results = [];
    for (const trackable of minutesAWeek) {
      const startDay = toCompactYYYYMMDD(trackable.startDayYYYYMMDD);
      const endDay = toCompactYYYYMMDD(trackable.endDayYYYYMMDD);
      const boundsOk =
        isYYYYMMDDCompact(startDay) &&
        isYYYYMMDDCompact(endDay) &&
        startDay <= endDay;
      const cap = !boundsOk
        ? undefined
        : today < startDay
          ? undefined
          : today <= endDay
            ? today
            : endDay;
      const perWeekMin = trackable.targetNumberOfMinutesAWeek ?? 0;
      if (cap === undefined || perWeekMin <= 0) {
        results.push({
          trackableId: trackable._id,
          name: trackable.name,
          legacy: 0,
          next: 0,
          match: true,
        });
        continue;
      }

      // ---- legacy: raw windows + union attribution -------------------
      const links = await ctx.db
        .query("listTrackableLinks")
        .withIndex("by_user", (q) => q.eq("userId", trackable.userId))
        .collect();
      const listMap = buildListIdToTrackableId(links);

      const rawWindows = await ctx.db
        .query("timeWindows")
        .withIndex("by_user_day", (q) =>
          q.eq("userId", trackable.userId).gte("startDayYYYYMMDD", startDay),
        )
        .collect();
      const actual = rawWindows
        .filter((w) => w.budgetType === "ACTUAL")
        .map((w) => ({
          ...w,
          startDayYYYYMMDD: toCompactYYYYMMDD(w.startDayYYYYMMDD),
        }));

      const taskInfoMap = new Map<string, TaskInfo>();
      for (const w of actual) {
        if (!w.taskId || taskInfoMap.has(String(w.taskId))) continue;
        const task = await ctx.db.get(w.taskId);
        if (task) {
          taskInfoMap.set(String(w.taskId), {
            trackableId: task.trackableId ?? null,
            listId: task.listId ?? null,
          });
        }
      }
      const attributed = actual.filter((w) =>
        timeWindowAttributedToTrackable(
          w,
          trackable._id,
          taskInfoMap,
          listMap,
        ),
      );

      let legacy = 0;
      {
        let monday = startOfWeekYYYYMMDD(startDay);
        while (monday <= cap) {
          const weekEndDay = addDaysYYYYMMDD(monday, 6);
          let weekSeconds = 0;
          for (const w of attributed) {
            if (
              w.startDayYYYYMMDD >= monday &&
              w.startDayYYYYMMDD <= weekEndDay &&
              w.startDayYYYYMMDD >= startDay &&
              w.startDayYYYYMMDD <= endDay &&
              w.startDayYYYYMMDD <= cap
            ) {
              weekSeconds += w.durationSeconds;
            }
          }
          if (Math.floor(weekSeconds / 60) >= perWeekMin) legacy += perWeekMin;
          monday = addDaysYYYYMMDD(monday, 7);
        }
      }

      // ---- next: denormalized trackableDaySeconds --------------------
      const firstMonday = startOfWeekYYYYMMDD(startDay);
      const dayRows = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_trackable_day", (q) =>
          q
            .eq("trackableId", trackable._id)
            .gte("dayYYYYMMDD", firstMonday)
            .lte("dayYYYYMMDD", cap),
        )
        .collect();
      const secondsByDay = new Map<string, number>();
      for (const r of dayRows) {
        secondsByDay.set(
          r.dayYYYYMMDD,
          (secondsByDay.get(r.dayYYYYMMDD) ?? 0) + r.attributedSeconds,
        );
      }
      let next = 0;
      {
        let monday = firstMonday;
        while (monday <= cap) {
          let weekSeconds = 0;
          for (let i = 0; i < 7; i++) {
            const day = addDaysYYYYMMDD(monday, i);
            if (day < startDay || day > endDay || day > cap) continue;
            weekSeconds += secondsByDay.get(day) ?? 0;
          }
          if (Math.floor(weekSeconds / 60) >= perWeekMin) next += perWeekMin;
          monday = addDaysYYYYMMDD(monday, 7);
        }
      }

      results.push({
        trackableId: trackable._id as Id<"trackables">,
        name: trackable.name,
        legacy,
        next,
        match: legacy === next,
      });
    }

    return {
      diffCount: results.filter((r) => !r.match).length,
      results,
    };
  },
});
