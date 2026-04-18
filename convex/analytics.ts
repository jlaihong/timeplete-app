import { query } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const getTimeBreakdown = query({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    collaboratorIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const userIds = [user._id, ...(args.collaboratorIds ?? [])];
    let allWindows = [];

    for (const uid of userIds) {
      const windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_user", (q) => q.eq("userId", uid))
        .collect();

      allWindows.push(
        ...windows.filter(
          (w) =>
            w.startDayYYYYMMDD >= args.startDay &&
            w.startDayYYYYMMDD <= args.endDay &&
            w.budgetType === "ACTUAL"
        )
      );
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const taskMap = new Map(tasks.map((t) => [t._id, t]));

    const tags = await ctx.db
      .query("tags")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const tagMap = new Map(tags.map((t) => [t._id, t]));

    const lists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listMap = new Map(lists.map((l) => [l._id, l]));

    const trackables = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const trackableMap = new Map(trackables.map((t) => [t._id, t]));

    return {
      timeWindows: allWindows,
      tasks: Object.fromEntries(taskMap),
      tags: Object.fromEntries(tagMap),
      lists: Object.fromEntries(listMap),
      trackables: Object.fromEntries(trackableMap),
    };
  },
});

export const getProgressionStats = query({
  args: {
    trackableIds: v.array(v.id("trackables")),
    daily: v.optional(v.object({ date: v.string() })),
    weekly: v.optional(v.object({ date: v.string() })),
    monthly: v.optional(v.object({ date: v.string() })),
    yearly: v.optional(v.object({ date: v.string() })),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const results: Record<string, any> = {};

    for (const trackableId of args.trackableIds) {
      const trackable = await ctx.db.get(trackableId);
      if (!trackable) continue;

      const timeWindows = await ctx.db
        .query("timeWindows")
        .withIndex("by_trackable", (q) => q.eq("trackableId", trackableId))
        .collect();

      const trackerEntries = await ctx.db
        .query("trackerEntries")
        .withIndex("by_trackable", (q) => q.eq("trackableId", trackableId))
        .collect();

      const trackableDays = await ctx.db
        .query("trackableDays")
        .withIndex("by_trackable", (q) => q.eq("trackableId", trackableId))
        .collect();

      results[trackableId] = {
        totalTimeSeconds: timeWindows
          .filter((w) => w.budgetType === "ACTUAL")
          .reduce((s, w) => s + w.durationSeconds, 0),
        totalCount: trackerEntries.reduce(
          (s, e) => s + (e.countValue ?? 0),
          0
        ),
        daysCompleted: trackableDays.filter((d) => d.numCompleted > 0).length,
        calendarEvents: timeWindows.length,
      };
    }

    return results;
  },
});
