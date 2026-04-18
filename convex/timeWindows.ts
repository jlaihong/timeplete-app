import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const search = query({
  args: {
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    budgetType: v.optional(v.string()),
    activityType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    let windows;
    if (args.taskId) {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!))
        .collect();
    } else if (args.trackableId) {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_trackable", (q) =>
          q.eq("trackableId", args.trackableId!)
        )
        .collect();
    } else {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    }

    return windows.filter((w) => {
      if (args.startDay && w.startDayYYYYMMDD < args.startDay) return false;
      if (args.endDay && w.startDayYYYYMMDD > args.endDay) return false;
      if (args.budgetType && w.budgetType !== args.budgetType) return false;
      if (args.activityType && w.activityType !== args.activityType) return false;
      return true;
    });
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("timeWindows")),
    startTimeHHMM: v.string(),
    startDayYYYYMMDD: v.string(),
    durationSeconds: v.number(),
    budgetType: v.union(v.literal("ACTUAL"), v.literal("BUDGETED")),
    activityType: v.union(
      v.literal("TASK"),
      v.literal("EVENT"),
      v.literal("TRACKABLE")
    ),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    title: v.optional(v.string()),
    comments: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Time window not found");
      await ctx.db.patch(args.id, {
        startTimeHHMM: args.startTimeHHMM,
        startDayYYYYMMDD: args.startDayYYYYMMDD,
        durationSeconds: args.durationSeconds,
        budgetType: args.budgetType,
        activityType: args.activityType,
        taskId: args.taskId,
        trackableId: args.trackableId,
        title: args.title,
        comments: args.comments,
        tagIds: args.tagIds,
        timeZone: args.timeZone,
      });
      return args.id;
    }

    return await ctx.db.insert("timeWindows", {
      startTimeHHMM: args.startTimeHHMM,
      startDayYYYYMMDD: args.startDayYYYYMMDD,
      durationSeconds: args.durationSeconds,
      userId: user._id,
      budgetType: args.budgetType,
      activityType: args.activityType,
      taskId: args.taskId,
      trackableId: args.trackableId,
      title: args.title,
      comments: args.comments,
      tagIds: args.tagIds,
      timeZone: args.timeZone,
      isRecurringInstance: false,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("timeWindows") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tw = await ctx.db.get(args.id);
    if (!tw) throw new Error("Time window not found");
    await ctx.db.delete(args.id);
  },
});
