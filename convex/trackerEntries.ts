import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { onTrackerEntryWrite } from "./_helpers/trackableLifetime";
import { toCompactYYYYMMDD } from "./_helpers/compactYYYYMMDD";

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
    // Store compact so the `by_trackable_day` index reads (bounded query
    // reads + lifetime maintenance) can use exact/range day keys.
    const nextDay = toCompactYYYYMMDD(args.dayYYYYMMDD);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Entry not found");
      await ctx.db.patch(args.id, {
        dayYYYYMMDD: nextDay,
        countValue: nextCountValue,
        durationSeconds: nextDurationSeconds,
        startTimeHHMM: args.startTimeHHMM,
        comments: args.comments,
      });
      // Sync the denormalized trackable totals + daily-average
      // aggregates from the before/after snapshots (handles value
      // diffs, day moves, and `firstActivityDayYYYYMMDD` pull-down).
      await onTrackerEntryWrite(ctx, {
        trackableId: existing.trackableId,
        entryId: args.id,
        before: {
          dayYYYYMMDD: existing.dayYYYYMMDD,
          countValue: existing.countValue,
          durationSeconds: existing.durationSeconds,
        },
        after: {
          dayYYYYMMDD: nextDay,
          countValue: nextCountValue,
          durationSeconds: nextDurationSeconds,
        },
      });
      return args.id;
    }

    const insertedId = await ctx.db.insert("trackerEntries", {
      trackableId: args.trackableId,
      userId: user._id,
      dayYYYYMMDD: nextDay,
      countValue: nextCountValue,
      durationSeconds: nextDurationSeconds,
      startTimeHHMM: args.startTimeHHMM,
      comments: args.comments,
    });
    await onTrackerEntryWrite(ctx, {
      trackableId: args.trackableId,
      entryId: insertedId,
      before: null,
      after: {
        dayYYYYMMDD: nextDay,
        countValue: nextCountValue,
        durationSeconds: nextDurationSeconds,
      },
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
    await onTrackerEntryWrite(ctx, {
      trackableId: entry.trackableId,
      entryId: args.id,
      before: {
        dayYYYYMMDD: entry.dayYYYYMMDD,
        countValue: entry.countValue,
        durationSeconds: entry.durationSeconds,
      },
      after: null,
    });
  },
});
