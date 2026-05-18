import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { onTrackerEntryDelta } from "./_helpers/trackableLifetime";

export const search = query({
  args: {
    trackableId: v.id("trackables"),
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return { entries: [], totalCount: 0 };

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

    const nextCountValue = trackable.trackCount ? args.countValue : undefined;
    const nextDurationSeconds = trackable.trackTime
      ? args.durationSeconds
      : undefined;

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Entry not found");
      await ctx.db.patch(args.id, {
        dayYYYYMMDD: args.dayYYYYMMDD,
        countValue: nextCountValue,
        durationSeconds: nextDurationSeconds,
        startTimeHHMM: args.startTimeHHMM,
        comments: args.comments,
      });
      // Adjust the denormalized trackable totals by the diff (fix #1).
      // Row count is unchanged on a patch, but the day may shift earlier
      // so we still pass it through for the `firstActivityDayYYYYMMDD`
      // pull-down.
      const dCount =
        (nextCountValue ?? 0) - (existing.countValue ?? 0);
      const dSeconds =
        (nextDurationSeconds ?? 0) - (existing.durationSeconds ?? 0);
      if (dCount !== 0 || dSeconds !== 0) {
        await onTrackerEntryDelta(ctx, {
          trackableId: existing.trackableId,
          deltaCountValue: dCount,
          deltaDurationSeconds: dSeconds,
          // Patch — row already exists, so the counter doesn't move.
          // The helper still re-evaluates `firstActivityDayYYYYMMDD`
          // when the day moved earlier.
          deltaRowCount: 0,
          dayYYYYMMDD: args.dayYYYYMMDD,
        });
      }
      return args.id;
    }

    const insertedId = await ctx.db.insert("trackerEntries", {
      trackableId: args.trackableId,
      userId: user._id,
      dayYYYYMMDD: args.dayYYYYMMDD,
      countValue: nextCountValue,
      durationSeconds: nextDurationSeconds,
      startTimeHHMM: args.startTimeHHMM,
      comments: args.comments,
    });
    await onTrackerEntryDelta(ctx, {
      trackableId: args.trackableId,
      deltaCountValue: nextCountValue ?? 0,
      deltaDurationSeconds: nextDurationSeconds ?? 0,
      deltaRowCount: 1,
      dayYYYYMMDD: args.dayYYYYMMDD,
    });
    return insertedId;
  },
});

export const remove = mutation({
  args: { id: v.id("trackerEntries") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const entry = await ctx.db.get(args.id);
    if (!entry) throw new Error("Entry not found");
    await ctx.db.delete(args.id);
    await onTrackerEntryDelta(ctx, {
      trackableId: entry.trackableId,
      deltaCountValue: -(entry.countValue ?? 0),
      deltaDurationSeconds: -(entry.durationSeconds ?? 0),
      deltaRowCount: -1,
      dayYYYYMMDD: entry.dayYYYYMMDD,
    });
  },
});
