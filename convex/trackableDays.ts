import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const search = query({
  args: {
    trackableIds: v.array(v.id("trackables")),
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
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
