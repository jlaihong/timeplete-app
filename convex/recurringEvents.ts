import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

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
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    return await ctx.db.insert("recurringEvents", {
      ...args,
      userId: user._id,
    });
  },
});

export const updateRule = mutation({
  args: {
    id: v.id("recurringEvents"),
    title: v.optional(v.string()),
    startTimeHHMM: v.optional(v.string()),
    durationSeconds: v.optional(v.number()),
    comments: v.optional(v.string()),
    endDateYYYYMMDD: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const { id, ...patch } = args;
    const cleanPatch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(patch)) {
      if (val !== undefined) cleanPatch[k] = val;
    }
    await ctx.db.patch(args.id, cleanPatch as any);
  },
});

export const stop = mutation({
  args: { id: v.id("recurringEvents"), endDateYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.patch(args.id, { endDateYYYYMMDD: args.endDateYYYYMMDD });
  },
});

export const deleteInstance = mutation({
  args: { recurringEventId: v.id("recurringEvents"), dateYYYYMMDD: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.insert("deletedRecurringEventOccurrences", {
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
