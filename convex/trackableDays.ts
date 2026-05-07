import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { buildListIdToTrackableId } from "./_helpers/trackableAttribution";
import { isYYYYMMDDCompact, toCompactYYYYMMDD } from "./_helpers/compactYYYYMMDD";

/**
 * One round-trip for the edit-trackable Progress tab month grid:
 * per-day manual count (`numCompleted`), saved comments, and completed
 * task titles that attribute to the trackable (same rules as
 * `trackables.getCompletedTaskNamesForDay` / productivity-one
 * `monthly-trackable-calendar`).
 */
export const progressCalendarDetails = query({
  args: {
    trackableId: v.id("trackables"),
    startDay: v.string(),
    endDay: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const start = toCompactYYYYMMDD(args.startDay);
    const end = toCompactYYYYMMDD(args.endDay);
    if (!isYYYYMMDDCompact(start) || !isYYYYMMDDCompact(end) || start > end) {
      return [];
    }

    const trackable = await ctx.db.get(args.trackableId);
    if (!trackable || trackable.userId !== user._id) {
      return [];
    }

    const days = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.trackableId))
      .collect();

    const byDay = new Map<
      string,
      { numCompleted: number; comments: string }
    >();
    for (const d of days) {
      const day = toCompactYYYYMMDD(d.dayYYYYMMDD);
      if (!day || day < start || day > end) continue;
      byDay.set(day, {
        numCompleted: d.numCompleted,
        comments: (d.comments ?? "").trim(),
      });
    }

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(links);

      const attributesToTrackable =
        t.trackableId === args.trackableId ||
        (t.listId != null && listIdToTrackableId.get(t.listId) === args.trackableId);
      if (!attributesToTrackable) continue;

      const arr = taskNamesByDay.get(dayCompact) ?? [];
      arr.push(t.name);
      taskNamesByDay.set(dayCompact, arr);
    }

    const allDays = new Set<string>([...byDay.keys(), ...taskNamesByDay.keys()]);
    return [...allDays]
      .sort()
      .map((dayYYYYMMDD) => ({
        dayYYYYMMDD,
        numCompleted: byDay.get(dayYYYYMMDD)?.numCompleted ?? 0,
        comments: byDay.get(dayYYYYMMDD)?.comments ?? "",
        completedTaskNames: taskNamesByDay.get(dayYYYYMMDD) ?? [],
      }));
  },
});

export const search = query({
  args: {
    trackableIds: v.array(v.id("trackables")),
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const results = [];

    for (const trackableId of args.trackableIds) {
      const days = await ctx.db
        .query("trackableDays")
        .withIndex("by_trackable", (q) => q.eq("trackableId", trackableId))
        .collect();

      const filtered = days.filter((d) => {
        if (args.startDay && d.dayYYYYMMDD < args.startDay) return false;
        if (args.endDay && d.dayYYYYMMDD > args.endDay) return false;
        return true;
      });

      results.push(...filtered);
    }

    return results;
  },
});

export const upsert = mutation({
  args: {
    trackableId: v.id("trackables"),
    dayYYYYMMDD: v.string(),
    numCompleted: v.number(),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const existing = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable_day", (q) =>
        q
          .eq("trackableId", args.trackableId)
          .eq("dayYYYYMMDD", args.dayYYYYMMDD)
      )
      .filter((q) => q.eq(q.field("userId"), user._id))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        numCompleted: args.numCompleted,
        comments: args.comments ?? existing.comments,
      });
      return existing._id;
    }

    return await ctx.db.insert("trackableDays", {
      trackableId: args.trackableId,
      userId: user._id,
      dayYYYYMMDD: args.dayYYYYMMDD,
      numCompleted: args.numCompleted,
      comments: args.comments ?? "",
    });
  },
});
