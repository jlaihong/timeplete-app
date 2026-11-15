/**
 * A trackable's progress: its measure's value for the current period, the
 * goal it is held against, and this week day by day.
 *
 * One calculation for every trackable (`lib/trackableShape.ts`), fed by the
 * per-day facts the write paths maintain:
 *
 *   trackableDaySeconds   seconds of time that counted, per day. Already
 *                         includes everything below it in the tree.
 *   trackableDays         completed tasks that counted (`attributedTaskCount`,
 *                         also rolled up) and manual check-ins (`numCompleted`).
 *   trackerEntries        values and time logged by hand.
 *
 * Check-ins and hand-logged entries belong to the trackable they were
 * logged on, so for a parent they are read from its descendants here.
 *
 * Reads are bounded by the period: at most a month of rows, or, for a goal
 * "in total", the days since the trackable started.
 */
import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireApprovedUserOrEmpty } from "./_helpers/auth";
import { toCompactYYYYMMDD } from "./_helpers/compactYYYYMMDD";
import { loadDescendants } from "./_helpers/trackableMembership";
import {
  EMPTY_DAY,
  goalStatus,
  goalTarget,
  measureValue,
  periodRange,
  shapeOf,
  shiftDay,
  weekOf,
  type DayFacts,
} from "../lib/trackableShape";

/** Most days read for one trackable (about eight years). */
const MAX_DAYS = 3000;

type DayRow = DayFacts & { checkIns: number; comments: string };

async function loadDays(
  ctx: QueryCtx,
  trackable: Doc<"trackables">,
  from: string,
  to: string,
): Promise<Map<string, DayRow>> {
  const days = new Map<string, DayRow>();
  const at = (day: string): DayRow => {
    const key = toCompactYYYYMMDD(day);
    let row = days.get(key);
    if (!row) {
      row = { seconds: 0, count: 0, values: [], checkIns: 0, comments: "" };
      days.set(key, row);
    }
    return row;
  };

  const seconds = await ctx.db
    .query("trackableDaySeconds")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackable._id).gte("dayYYYYMMDD", from).lte("dayYYYYMMDD", to),
    )
    .take(MAX_DAYS);
  for (const row of seconds) at(row.dayYYYYMMDD).seconds += row.attributedSeconds;

  // Hand-logged check-ins and entries: this trackable's and its descendants'.
  const family: Id<"trackables">[] = [
    trackable._id,
    ...(await loadDescendants(ctx, trackable._id, 100)).map((t) => t._id),
  ];
  for (const id of family) {
    const own = id === trackable._id;
    const dayRows = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable_day", (q) =>
        q.eq("trackableId", id).gte("dayYYYYMMDD", from).lte("dayYYYYMMDD", to),
      )
      .take(MAX_DAYS);
    for (const row of dayRows) {
      const day = at(row.dayYYYYMMDD);
      day.count += row.numCompleted;
      if (own) {
        // Completed tasks are already rolled up onto this trackable.
        day.count += row.attributedTaskCount ?? 0;
        day.checkIns += row.numCompleted;
        day.comments = row.comments;
      }
    }
    const entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable_day", (q) =>
        q.eq("trackableId", id).gte("dayYYYYMMDD", from).lte("dayYYYYMMDD", to),
      )
      .take(MAX_DAYS);
    for (const entry of entries) {
      const day = at(entry.dayYYYYMMDD);
      day.seconds += entry.durationSeconds ?? 0;
      if (entry.countValue !== undefined) {
        day.count += entry.countValue;
        day.values.push(entry.countValue);
      }
    }
  }
  return days;
}

export const get = query({
  args: {
    id: v.id("trackables"),
    /** The viewer's local day, YYYYMMDD. */
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id) return null;

    const today = toCompactYYYYMMDD(args.today);
    const { measure, goal } = shapeOf(trackable);
    const cumulative = trackable.isCumulative !== false;
    const week = weekOf(today);
    // With no goal the card still shows a period: this week.
    const period = periodRange(
      goal?.period ?? "week",
      today,
      toCompactYYYYMMDD(trackable.startDayYYYYMMDD) || today,
    );
    const from = period.start < week.start ? period.start : week.start;
    const to = period.end > week.end ? period.end : week.end;
    const days = await loadDays(ctx, trackable, from, to);

    const inRange = (start: string, end: string): DayFacts[] => {
      const out: DayFacts[] = [];
      for (const [day, facts] of days) {
        if (day >= start && day <= end) out.push(facts);
      }
      return out;
    };
    const value = measureValue(
      measure,
      inRange(period.start, period.end),
      cumulative,
    );

    return {
      measure,
      goal,
      cumulative,
      period: { kind: goal?.period ?? ("week" as const), ...period },
      value,
      target: goal ? goalTarget(measure, goal) : null,
      status: goal ? goalStatus(measure, goal, value) : null,
      todayValue: measureValue(measure, inRange(today, today), cumulative),
      week: Array.from({ length: 7 }, (_, i) => {
        const day = shiftDay(week.start, i);
        const row = days.get(day);
        return {
          dayYYYYMMDD: day,
          value: measureValue(measure, [row ?? EMPTY_DAY], cumulative),
          /** Manual check-ins on this trackable itself that day. */
          checkIns: row?.checkIns ?? 0,
          comments: row?.comments ?? "",
        };
      }),
    };
  },
});

/**
 * What a trackable's number for the current period is made up of: each
 * direct sub-trackable's share, and what was allocated to the trackable
 * itself rather than through a sub-trackable.
 *
 * Everything is in the parent's measure and over the parent's period, so
 * the parts can be compared with its total. Parts can add up to more than
 * the total: an event allocated to two sub-trackables counts once for the
 * parent. `overlap` says by how much.
 */
export const breakdown = query({
  args: { id: v.id("trackables"), today: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id) return null;

    const today = toCompactYYYYMMDD(args.today);
    const { measure, goal } = shapeOf(trackable);
    const cumulative = trackable.isCumulative !== false;
    const kind = goal?.period ?? ("week" as const);
    const period = periodRange(
      kind,
      today,
      toCompactYYYYMMDD(trackable.startDayYYYYMMDD) || today,
    );
    const valueOf = async (t: Doc<"trackables">) =>
      measureValue(
        measure,
        [...(await loadDays(ctx, t, period.start, period.end)).values()],
        cumulative,
      );

    const children = (
      await ctx.db
        .query("trackables")
        .withIndex("by_parent", (q) => q.eq("parentId", trackable._id))
        .take(100)
    )
      .filter((c) => !c.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const parts = [];
    for (const child of children) {
      parts.push({
        _id: child._id,
        name: child.name,
        colour: child.colour,
        value: await valueOf(child),
      });
    }
    const total = await valueOf(trackable);

    // Shares only add up for sums. A bounded period keeps the scan small.
    const additive = measure === "time" || measure === "count";
    let direct: number | null = null;
    if (additive && children.length > 0 && kind !== "total") {
      const childIds = new Set<string>(children.map((c) => c._id));
      const countsDirectly = (stamp: Id<"trackables">[] | undefined) =>
        !!stamp &&
        stamp.includes(trackable._id) &&
        !stamp.some((id) => childIds.has(id));
      direct = 0;
      // Logged by hand on the trackable itself.
      const ownEntries = await ctx.db
        .query("trackerEntries")
        .withIndex("by_trackable_day", (q) =>
          q
            .eq("trackableId", trackable._id)
            .gte("dayYYYYMMDD", period.start)
            .lte("dayYYYYMMDD", period.end),
        )
        .take(MAX_DAYS);
      if (measure === "time") {
        for (const e of ownEntries) direct += e.durationSeconds ?? 0;
        const windows = await ctx.db
          .query("timeWindows")
          .withIndex("by_user_budget_day", (q) =>
            q
              .eq("userId", user._id)
              .eq("budgetType", "ACTUAL")
              .gte("startDayYYYYMMDD", period.start)
              .lte("startDayYYYYMMDD", period.end),
          )
          .take(5000);
        for (const w of windows) {
          if (countsDirectly(w.attributedTrackableIds)) {
            direct += w.durationSeconds;
          }
        }
      } else {
        for (const e of ownEntries) direct += e.countValue ?? 0;
        const ownDays = await ctx.db
          .query("trackableDays")
          .withIndex("by_trackable_day", (q) =>
            q
              .eq("trackableId", trackable._id)
              .gte("dayYYYYMMDD", period.start)
              .lte("dayYYYYMMDD", period.end),
          )
          .take(MAX_DAYS);
        for (const d of ownDays) direct += d.numCompleted;
        const tasks = await ctx.db
          .query("tasks")
          .withIndex("by_user_completed_day", (q) =>
            q
              .eq("userId", user._id)
              .gte("dateCompleted", period.start)
              .lte("dateCompleted", period.end),
          )
          .take(5000);
        for (const t of tasks) {
          if (countsDirectly(t.attributedTrackableIds)) direct += 1;
        }
      }
    }

    const partsSum = parts.reduce((s, p) => s + p.value, 0);
    return {
      measure,
      period: { kind, ...period },
      total,
      /** Whether the parts are shares of the total (time, times done). */
      additive,
      parts,
      direct,
      overlap:
        direct !== null ? Math.max(0, partsSum + direct - total) : null,
    };
  },
});
