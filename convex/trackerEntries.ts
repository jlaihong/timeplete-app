import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const search = query({
  args: {
    trackableId: v.id("trackables"),
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    let entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable", (q) =>
        q.eq("trackableId", args.trackableId)
      )
      .collect();

    entries = entries.filter((e) => {
      if (args.startDay && e.dayYYYYMMDD < args.startDay) return false;
      if (args.endDay && e.dayYYYYMMDD > args.endDay) return false;
      return true;
    });

    // Match productivity-one `TrackerDetailsDialog.mergeAndSortHistoryRows`:
    // newest day first, then start time descending within a day.
    entries.sort((a, b) => {
      const d = b.dayYYYYMMDD.localeCompare(a.dayYYYYMMDD);
      if (d !== 0) return d;
      const ta = a.startTimeHHMM ?? "";
      const tb = b.startTimeHHMM ?? "";
      return tb.localeCompare(ta);
    });

    const total = entries.length;
    const offset = args.offset ?? 0;
    const limit = Math.min(args.limit ?? 100, 2000);
    const sliced = entries.slice(offset, offset + limit);

    return { entries: sliced, totalCount: total };
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("trackerEntries")),
    trackableId: v.id("trackables"),
    dayYYYYMMDD: v.string(),
    countValue: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    startTimeHHMM: v.optional(v.string()),
    comments: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const trackable = await ctx.db.get(args.trackableId);
    if (!trackable) throw new Error("Trackable not found");

    if (args.id) {
      await ctx.db.patch(args.id, {
        dayYYYYMMDD: args.dayYYYYMMDD,
        countValue: trackable.trackCount ? args.countValue : undefined,
        durationSeconds: trackable.trackTime ? args.durationSeconds : undefined,
        startTimeHHMM: args.startTimeHHMM,
        comments: args.comments,
      });
      return args.id;
    }

    return await ctx.db.insert("trackerEntries", {
      trackableId: args.trackableId,
      userId: user._id,
      dayYYYYMMDD: args.dayYYYYMMDD,
      countValue: trackable.trackCount ? args.countValue : undefined,
      durationSeconds: trackable.trackTime ? args.durationSeconds : undefined,
      startTimeHHMM: args.startTimeHHMM,
      comments: args.comments,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("trackerEntries") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Entry not found");
    await ctx.db.delete(args.id);
  },
});
