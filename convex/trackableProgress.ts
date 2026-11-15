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

type DayRow = DayFacts & {
  /** Manual check-ins on the trackable itself. */
  checkIns: number;
  /** Completed tasks that counted (already rolled up from below). */
  taskCount: number;
  comments: string;
};

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
      row = {
        seconds: 0,
        count: 0,
        values: [],
        checkIns: 0,
        taskCount: 0,
        comments: "",
      };
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
        day.taskCount += row.attributedTaskCount ?? 0;
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

/**
 * A month of a trackable, day by day, in its own measure: the calendar on
 * its page. Also says what the goal is, so days can be marked against a
 * daily goal.
 */
export const month = query({
  args: {
    id: v.id("trackables"),
    /** Any day in the month, YYYYMMDD. */
    day: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id) return null;
    const { measure, goal } = shapeOf(trackable);
    const cumulative = trackable.isCumulative !== false;
    const range = periodRange("month", toCompactYYYYMMDD(args.day), "");
    const days = await loadDays(ctx, trackable, range.start, range.end);
    const all = [...days.values()];
    return {
      measure,
      goal,
      start: range.start,
      end: range.end,
      total: measureValue(measure, all, cumulative),
      days: [...days.entries()]
        .map(([day, facts]) => ({
          dayYYYYMMDD: day,
          value: measureValue(measure, [facts], cumulative),
        }))
        .filter((d) => d.value > 0),
    };
  },
});

/** One day of a trackable, for the log dialog: what is already there. */
export const day = query({
  args: { id: v.id("trackables"), day: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id) return null;
    const compact = toCompactYYYYMMDD(args.day);
    const row = (await loadDays(ctx, trackable, compact, compact)).get(compact);
    return {
      name: trackable.name,
      colour: trackable.colour,
      measure: shapeOf(trackable).measure,
      cumulative: trackable.isCumulative !== false,
      checkIns: row?.checkIns ?? 0,
      taskCount: row?.taskCount ?? 0,
      comments: row?.comments ?? "",
    };
  },
});

/** How far back "What counted" looks for matching events and tasks. */
const COUNTED_SCAN = 1500;

/**
 * "What counted": the most recent things that fed a trackable. Events and
 * logged time, completed tasks, and values or check-ins logged by hand,
 * newest first. Each says which direct sub-trackable it came through, if
 * any.
 *
 * Events and tasks are found by their stamp (`attributedTrackableIds`),
 * scanning the user's most recent ones, so a trackable that has not been
 * used for a long time may show fewer rows than it has.
 */
export const counted = query({
  args: { id: v.id("trackables"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id) return [];
    const limit = Math.min(args.limit ?? 50, 200);

    const children = await ctx.db
      .query("trackables")
      .withIndex("by_parent", (q) => q.eq("parentId", trackable._id))
      .take(100);
    const childById = new Map(children.map((c) => [c._id as string, c]));
    /** The direct sub-trackables an item came through (often one). */
    const via = (stamp: Id<"trackables">[] | undefined) =>
      (stamp ?? [])
        .map((id) => childById.get(id))
        .filter((c): c is Doc<"trackables"> => !!c)
        .map((c) => ({ name: c.name, colour: c.colour }));
    const counts = (stamp: Id<"trackables">[] | undefined) =>
      !!stamp && stamp.includes(trackable._id);

    type Item = {
      kind: "event" | "task" | "value" | "checkIn";
      id: string;
      dayYYYYMMDD: string;
      startTimeHHMM: string | null;
      title: string;
      seconds: number | null;
      count: number | null;
      via: { name: string; colour: string }[];
    };
    const items: Item[] = [];

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user_budget_day", (q) =>
        q.eq("userId", user._id).eq("budgetType", "ACTUAL"),
      )
      .order("desc")
      .take(COUNTED_SCAN);
    for (const w of windows) {
      if (items.length >= limit) break;
      if (!counts(w.attributedTrackableIds)) continue;
      const task = w.taskId ? await ctx.db.get(w.taskId) : null;
      items.push({
        kind: "event",
        id: w._id,
        dayYYYYMMDD: toCompactYYYYMMDD(w.startDayYYYYMMDD),
        startTimeHHMM: w.startTimeHHMM,
        title: w.title ?? task?.name ?? w.comments ?? "Logged time",
        seconds: w.durationSeconds,
        count: null,
        via: via(w.attributedTrackableIds),
      });
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed_day", (q) =>
        q.eq("userId", user._id).gt("dateCompleted", ""),
      )
      .order("desc")
      .take(COUNTED_SCAN);
    let taskRows = 0;
    for (const t of tasks) {
      if (taskRows >= limit) break;
      if (!t.dateCompleted || !counts(t.attributedTrackableIds)) continue;
      taskRows += 1;
      items.push({
        kind: "task",
        id: t._id,
        dayYYYYMMDD: toCompactYYYYMMDD(t.dateCompleted),
        startTimeHHMM: null,
        title: t.name,
        seconds: null,
        count: 1,
        via: via(t.attributedTrackableIds),
      });
    }

    // Logged by hand on this trackable itself.
    const entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable_day", (q) => q.eq("trackableId", trackable._id))
      .order("desc")
      .take(limit);
    for (const e of entries) {
      items.push({
        kind: "value",
        id: e._id,
        dayYYYYMMDD: toCompactYYYYMMDD(e.dayYYYYMMDD),
        startTimeHHMM: e.startTimeHHMM ?? null,
        title: e.comments ?? "",
        seconds: e.durationSeconds ?? null,
        count: e.countValue ?? null,
        via: [],
      });
    }
    const checkIns = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable_day", (q) => q.eq("trackableId", trackable._id))
      .order("desc")
      .take(limit);
    for (const d of checkIns) {
      if (d.numCompleted <= 0) continue;
      items.push({
        kind: "checkIn",
        id: d._id,
        dayYYYYMMDD: toCompactYYYYMMDD(d.dayYYYYMMDD),
        startTimeHHMM: null,
        title: d.comments,
        seconds: null,
        count: d.numCompleted,
        via: [],
      });
    }

    return items
      .sort(
        (a, b) =>
          b.dayYYYYMMDD.localeCompare(a.dayYYYYMMDD) ||
          (b.startTimeHHMM ?? "").localeCompare(a.startTimeHHMM ?? ""),
      )
      .slice(0, limit);
  },
});
