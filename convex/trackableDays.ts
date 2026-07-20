import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  onTrackableDayDelta,
  setTrackableWeekDayActive,
} from "./_helpers/trackableLifetime";

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
      // Keep the denormalized lifetime day count in step with the
      // numCompleted delta (fix #1).
      await onTrackableDayDelta(ctx, {
        trackableId: args.trackableId,
        deltaNumCompleted: args.numCompleted - existing.numCompleted,
        dayYYYYMMDD: args.dayYYYYMMDD,
      });
      const attributed = existing.attributedTaskCount ?? 0;
      const totalBefore = existing.numCompleted + attributed;
      const totalAfter = args.numCompleted + attributed;
      if (totalBefore > 0 !== totalAfter > 0) {
        await setTrackableWeekDayActive(
          ctx,
          args.trackableId,
          user._id,
          args.dayYYYYMMDD,
          totalAfter > 0,
        );
      }
      return existing._id;
    }

    const insertedId = await ctx.db.insert("trackableDays", {
      trackableId: args.trackableId,
      userId: user._id,
      dayYYYYMMDD: args.dayYYYYMMDD,
      numCompleted: args.numCompleted,
      comments: args.comments ?? "",
    });
    await onTrackableDayDelta(ctx, {
      trackableId: args.trackableId,
      deltaNumCompleted: args.numCompleted,
      dayYYYYMMDD: args.dayYYYYMMDD,
    });
    if (args.numCompleted > 0) {
      await setTrackableWeekDayActive(
        ctx,
        args.trackableId,
        user._id,
        args.dayYYYYMMDD,
        true,
      );
    }
    return insertedId;
  },
});
