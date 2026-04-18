import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";
import { generateOccurrences } from "./_helpers/recurrence";

const recurrenceFrequency = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("YEARLY")
);

const monthlyPattern = v.optional(
  v.union(v.literal("DAY_OF_MONTH"), v.literal("DAY_OF_WEEK"))
);

export const get = query({
  args: { id: v.id("recurringTasks") },
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
    monthlyPattern,
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    startDateYYYYMMDD: v.string(),
    endDateYYYYMMDD: v.optional(v.string()),
    startTimeHHMM: v.optional(v.string()),
    endTimeHHMM: v.optional(v.string()),
    name: v.string(),
    listId: v.optional(v.id("lists")),
    sectionId: v.optional(v.id("listSections")),
    trackableId: v.optional(v.id("trackables")),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeEstimatedInSeconds: v.optional(v.number()),
    sourceTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const ruleId = await ctx.db.insert("recurringTasks", {
      frequency: args.frequency,
      interval: args.interval,
      daysOfWeek: args.daysOfWeek,
      monthlyPattern: args.monthlyPattern,
      dayOfMonth: args.dayOfMonth,
      weekOfMonth: args.weekOfMonth,
      dayOfWeekMonthly: args.dayOfWeekMonthly,
      monthOfYear: args.monthOfYear,
      startDateYYYYMMDD: args.startDateYYYYMMDD,
      endDateYYYYMMDD: args.endDateYYYYMMDD,
      startTimeHHMM: args.startTimeHHMM,
      endTimeHHMM: args.endTimeHHMM,
      name: args.name,
      listId: args.listId,
      sectionId: args.sectionId,
      sectionOrderIndex: 0,
      trackableId: args.trackableId,
      tagIds: args.tagIds,
      timeEstimatedInSeconds: args.timeEstimatedInSeconds ?? 0,
      userId: user._id,
    });

    if (args.sourceTaskId) {
      const sourceTask = await ctx.db.get(args.sourceTaskId);
      if (sourceTask) {
        await ctx.db.patch(args.sourceTaskId, { recurringTaskId: ruleId });
      }
    }

    return ruleId;
  },
});

export const updateRule = mutation({
  args: {
    id: v.id("recurringTasks"),
    frequency: v.optional(recurrenceFrequency),
    interval: v.optional(v.number()),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern,
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    name: v.optional(v.string()),
    endDateYYYYMMDD: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeEstimatedInSeconds: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const patch: Record<string, unknown> = {};
    if (args.frequency) patch.frequency = args.frequency;
    if (args.interval !== undefined) patch.interval = args.interval;
    if (args.daysOfWeek) patch.daysOfWeek = args.daysOfWeek;
    if (args.monthlyPattern !== undefined) patch.monthlyPattern = args.monthlyPattern;
    if (args.dayOfMonth !== undefined) patch.dayOfMonth = args.dayOfMonth;
    if (args.weekOfMonth !== undefined) patch.weekOfMonth = args.weekOfMonth;
    if (args.dayOfWeekMonthly !== undefined) patch.dayOfWeekMonthly = args.dayOfWeekMonthly;
    if (args.name) patch.name = args.name;
    if (args.endDateYYYYMMDD !== undefined) patch.endDateYYYYMMDD = args.endDateYYYYMMDD;
    if (args.tagIds) patch.tagIds = args.tagIds;
    if (args.timeEstimatedInSeconds !== undefined)
      patch.timeEstimatedInSeconds = args.timeEstimatedInSeconds;

    await ctx.db.patch(args.id, patch as any);
  },
});

export const stop = mutation({
  args: { id: v.id("recurringTasks"), endDateYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");
    await ctx.db.patch(args.id, { endDateYYYYMMDD: args.endDateYYYYMMDD });
  },
});

export const deleteInstance = mutation({
  args: { recurringTaskId: v.id("recurringTasks"), dateYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.insert("deletedRecurringOccurrences", {
      recurringTaskId: args.recurringTaskId,
      deletedDateYYYYMMDD: args.dateYYYYMMDD,
      userId: user._id,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recurringTasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const deletedOccs = await ctx.db
      .query("deletedRecurringOccurrences")
      .withIndex("by_recurring_task", (q) => q.eq("recurringTaskId", args.id))
      .collect();
    for (const d of deletedOccs) await ctx.db.delete(d._id);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_recurring", (q) => q.eq("recurringTaskId", args.id))
      .collect();
    for (const t of tasks) {
      if (t.isRecurringInstance) {
        await ctx.db.delete(t._id);
      } else {
        await ctx.db.patch(t._id, { recurringTaskId: undefined });
      }
    }

    await ctx.db.delete(args.id);
  },
});
