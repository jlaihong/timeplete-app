import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";
import { generateOccurrences } from "./_helpers/recurrence";

const recurrenceFrequency = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("YEARLY")
);

export const get = query({
  args: { id: v.id("recurringEvents") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");
    return rule;
  },
});

export const create = mutation({
  args: {
    frequency: recurrenceFrequency,
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern: v.optional(
      v.union(v.literal("DAY_OF_MONTH"), v.literal("DAY_OF_WEEK"))
    ),
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    startDateYYYYMMDD: v.string(),
    endDateYYYYMMDD: v.optional(v.string()),
    title: v.optional(v.string()),
    startTimeHHMM: v.string(),
    durationSeconds: v.number(),
    comments: v.optional(v.string()),
    trackableId: v.optional(v.id("trackables")),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.string(),
    budgetType: v.union(v.literal("ACTUAL"), v.literal("BUDGETED")),
    activityType: v.union(
      v.literal("TASK"),
      v.literal("EVENT"),
      v.literal("TRACKABLE")
    ),
    sourceTimeWindowId: v.optional(v.id("timeWindows")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const { sourceTimeWindowId, ...ruleFields } = args;
    const ruleId = await ctx.db.insert("recurringEvents", {
      ...ruleFields,
      userId: user._id,
    });
    if (sourceTimeWindowId) {
      const tw = await ctx.db.get(sourceTimeWindowId);
      if (tw && tw.userId === user._id) {
        await ctx.db.patch(sourceTimeWindowId, {
          recurringEventId: ruleId,
          isRecurringInstance: true,
        });
      }
    }
    return ruleId;
  },
});

export const updateRule = mutation({
  args: {
    id: v.id("recurringEvents"),
    frequency: v.optional(recurrenceFrequency),
    interval: v.optional(v.number()),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern: v.optional(
      v.union(v.literal("DAY_OF_MONTH"), v.literal("DAY_OF_WEEK"))
    ),
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    startDateYYYYMMDD: v.optional(v.string()),
    endDateYYYYMMDD: v.optional(v.union(v.string(), v.null())),
    title: v.optional(v.string()),
    startTimeHHMM: v.optional(v.union(v.string(), v.null())),
    durationSeconds: v.optional(v.number()),
    comments: v.optional(v.string()),
    trackableId: v.optional(v.union(v.id("trackables"), v.null())),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.optional(v.string()),
    budgetType: v.optional(v.union(v.literal("ACTUAL"), v.literal("BUDGETED"))),
    activityType: v.optional(
      v.union(v.literal("TASK"), v.literal("EVENT"), v.literal("TRACKABLE"))
    ),
    regenerateFromYYYYMMDD: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const patch: Record<string, unknown> = {};
    if (args.frequency !== undefined) patch.frequency = args.frequency;
    if (args.interval !== undefined) patch.interval = args.interval;
    if (args.daysOfWeek !== undefined) patch.daysOfWeek = args.daysOfWeek;
    if (args.monthlyPattern !== undefined) patch.monthlyPattern = args.monthlyPattern;
    if (args.dayOfMonth !== undefined) patch.dayOfMonth = args.dayOfMonth;
    if (args.weekOfMonth !== undefined) patch.weekOfMonth = args.weekOfMonth;
    if (args.dayOfWeekMonthly !== undefined)
      patch.dayOfWeekMonthly = args.dayOfWeekMonthly;
    if (args.monthOfYear !== undefined) patch.monthOfYear = args.monthOfYear;
    if (args.startDateYYYYMMDD !== undefined)
      patch.startDateYYYYMMDD = args.startDateYYYYMMDD;
    if (args.endDateYYYYMMDD !== undefined)
      patch.endDateYYYYMMDD = args.endDateYYYYMMDD ?? undefined;
    if (args.title !== undefined) patch.title = args.title;
    if (args.startTimeHHMM !== undefined)
      patch.startTimeHHMM = args.startTimeHHMM ?? undefined;
    if (args.durationSeconds !== undefined) patch.durationSeconds = args.durationSeconds;
    if (args.comments !== undefined) patch.comments = args.comments;
    if (args.trackableId !== undefined) patch.trackableId = args.trackableId ?? undefined;
    if (args.tagIds !== undefined) patch.tagIds = args.tagIds;
    if (args.timeZone !== undefined) patch.timeZone = args.timeZone;
    if (args.budgetType !== undefined) patch.budgetType = args.budgetType;
    if (args.activityType !== undefined) patch.activityType = args.activityType;
    await ctx.db.patch(args.id, patch as any);

    if (args.regenerateFromYYYYMMDD) {
      const floor = args.regenerateFromYYYYMMDD;
      const windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_recurring_event", (q) => q.eq("recurringEventId", args.id))
        .collect();
      for (const w of windows) {
        if (
          w.isRecurringInstance &&
          w.startDayYYYYMMDD &&
          w.startDayYYYYMMDD >= floor
        ) {
          await ctx.db.delete(w._id);
        }
      }
    }
  },
});

export const stop = mutation({
  args: { id: v.id("recurringEvents"), effectiveFromYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_recurring_event", (q) => q.eq("recurringEventId", args.id))
      .collect();
    for (const w of windows) {
      if (
        w.isRecurringInstance &&
        w.startDayYYYYMMDD &&
        w.startDayYYYYMMDD >= args.effectiveFromYYYYMMDD
      ) {
        await ctx.db.delete(w._id);
      }
    }

    const y = parseInt(args.effectiveFromYYYYMMDD.substring(0, 4), 10);
    const m = parseInt(args.effectiveFromYYYYMMDD.substring(4, 6), 10) - 1;
    const d = parseInt(args.effectiveFromYYYYMMDD.substring(6, 8), 10);
    const prev = new Date(y, m, d);
    prev.setDate(prev.getDate() - 1);
    const yyyy = prev.getFullYear().toString();
    const mm = String(prev.getMonth() + 1).padStart(2, "0");
    const dd = String(prev.getDate()).padStart(2, "0");
    await ctx.db.patch(args.id, {
      endDateYYYYMMDD: `${yyyy}${mm}${dd}`,
    });
  },
});

export const deleteInstance = mutation({
  args: { recurringEventId: v.id("recurringEvents"), dateYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const existing = await ctx.db
      .query("deletedRecurringEventOccurrences")
      .withIndex("by_recurring_date", (q) =>
        q
          .eq("recurringEventId", args.recurringEventId)
          .eq("deletedDateYYYYMMDD", args.dateYYYYMMDD)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("deletedRecurringEventOccurrences", {
      recurringEventId: args.recurringEventId,
      deletedDateYYYYMMDD: args.dateYYYYMMDD,
      userId: user._id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recurringEvents") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const deletedOccs = await ctx.db
      .query("deletedRecurringEventOccurrences")
      .withIndex("by_recurring_event", (q) =>
        q.eq("recurringEventId", args.id)
      )
      .collect();
    for (const d of deletedOccs) await ctx.db.delete(d._id);

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_recurring_event", (q) =>
        q.eq("recurringEventId", args.id)
      )
      .collect();
    for (const w of windows) {
      if (w.isRecurringInstance) {
        await ctx.db.delete(w._id);
      } else {
        await ctx.db.patch(w._id, { recurringEventId: undefined });
      }
    }

    await ctx.db.delete(args.id);
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);
    return await ctx.db
      .query("recurringEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const generateInstances = mutation({
  args: {
    rangeStartYYYYMMDD: v.string(),
    rangeEndYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rules = await ctx.db
      .query("recurringEvents")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    let created = 0;
    for (const rule of rules) {
      if (rule.startDateYYYYMMDD > args.rangeEndYYYYMMDD) continue;
      if (rule.endDateYYYYMMDD && rule.endDateYYYYMMDD < args.rangeStartYYYYMMDD)
        continue;

      const skipRows = await ctx.db
        .query("deletedRecurringEventOccurrences")
        .withIndex("by_recurring_event", (q) => q.eq("recurringEventId", rule._id))
        .collect();
      const deletedDates = new Set(skipRows.map((r) => r.deletedDateYYYYMMDD));

      const existing = await ctx.db
        .query("timeWindows")
        .withIndex("by_recurring_event", (q) => q.eq("recurringEventId", rule._id))
        .collect();
      const existingDates = new Set(existing.map((w) => w.startDayYYYYMMDD));

      const occs = generateOccurrences(
        {
          frequency: rule.frequency,
          interval: rule.interval,
          daysOfWeek: rule.daysOfWeek,
          monthlyPattern: rule.monthlyPattern as "DAY_OF_MONTH" | "DAY_OF_WEEK" | undefined,
          dayOfMonth: rule.dayOfMonth,
          weekOfMonth: rule.weekOfMonth,
          dayOfWeekMonthly: rule.dayOfWeekMonthly,
          monthOfYear: rule.monthOfYear,
          startDateYYYYMMDD: rule.startDateYYYYMMDD,
          endDateYYYYMMDD: rule.endDateYYYYMMDD,
        },
        args.rangeStartYYYYMMDD,
        args.rangeEndYYYYMMDD,
        deletedDates
      );

      for (const date of occs) {
        if (existingDates.has(date)) continue;
        await ctx.db.insert("timeWindows", {
          startTimeHHMM: rule.startTimeHHMM,
          startDayYYYYMMDD: date,
          durationSeconds: rule.durationSeconds,
          userId: user._id,
          budgetType: rule.budgetType,
          activityType: rule.activityType,
          trackableId: rule.trackableId,
          title: rule.title,
          comments: rule.comments,
          tagIds: rule.tagIds,
          timeZone: rule.timeZone,
          recurringEventId: rule._id,
          isRecurringInstance: true,
          source: "calendar",
        });
        created++;
      }
    }
    return { created };
  },
});

export const applyInstanceOverride = mutation({
  args: {
    timeWindowId: v.id("timeWindows"),
    detachFromSeries: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tw = await ctx.db.get(args.timeWindowId);
    if (!tw || tw.userId !== user._id) throw new Error("Time window not found");
    if (!tw.recurringEventId) throw new Error("Not a recurring instance");
    const patch: Record<string, unknown> = {};
    if (args.detachFromSeries) {
      patch.recurringEventId = undefined;
      patch.isRecurringInstance = false;
    } else {
      patch.isRecurringInstance = true;
    }
    await ctx.db.patch(args.timeWindowId, patch as any);
  },
});

export const recordDeletedOccurrence = mutation({
  args: {
    recurringEventId: v.id("recurringEvents"),
    deletedDateYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const existing = await ctx.db
      .query("deletedRecurringEventOccurrences")
      .withIndex("by_recurring_date", (q) =>
        q
          .eq("recurringEventId", args.recurringEventId)
          .eq("deletedDateYYYYMMDD", args.deletedDateYYYYMMDD)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("deletedRecurringEventOccurrences", {
      recurringEventId: args.recurringEventId,
      deletedDateYYYYMMDD: args.deletedDateYYYYMMDD,
      userId: user._id,
    });
  },
});

export type RecurringEventId = Id<"recurringEvents">;
