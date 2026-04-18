import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const search = query({
  args: { archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    let trackables = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (args.archived !== undefined) {
      trackables = trackables.filter((t) => t.archived === args.archived);
    }

    return trackables.sort((a, b) => a.orderIndex - b.orderIndex);
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("trackables")),
    name: v.string(),
    colour: v.string(),
    trackableType: v.union(
      v.literal("NUMBER"),
      v.literal("TIME_TRACK"),
      v.literal("DAYS_A_WEEK"),
      v.literal("MINUTES_A_WEEK"),
      v.literal("TRACKER")
    ),
    frequency: v.optional(
      v.union(v.literal("DAILY"), v.literal("WEEKLY"), v.literal("MONTHLY"))
    ),
    targetNumberOfHours: v.optional(v.number()),
    targetNumberOfDaysAWeek: v.optional(v.number()),
    targetNumberOfMinutesAWeek: v.optional(v.number()),
    targetNumberOfWeeks: v.optional(v.number()),
    targetCount: v.optional(v.number()),
    startDayYYYYMMDD: v.string(),
    endDayYYYYMMDD: v.string(),
    goalReasons: v.optional(v.array(v.string())),
    willAcceptPenalty: v.optional(v.boolean()),
    willDonateToCharity: v.optional(v.boolean()),
    willSendMoneyToAFriend: v.optional(v.boolean()),
    willPostOnSocialMedia: v.optional(v.boolean()),
    willShaveHead: v.optional(v.boolean()),
    otherPenaltySelected: v.optional(v.boolean()),
    otherPenalties: v.optional(v.array(v.string())),
    sendMoneyFriendName: v.optional(v.string()),
    sendMoneyFriendAmount: v.optional(v.number()),
    donateMoneyCharityAmount: v.optional(v.number()),
    isCumulative: v.optional(v.boolean()),
    trackTime: v.optional(v.boolean()),
    trackCount: v.optional(v.boolean()),
    autoCountFromCalendar: v.optional(v.boolean()),
    isRatingTracker: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id)
        throw new Error("Trackable not found");

      const { id, ...updateFields } = args;
      await ctx.db.patch(args.id, {
        ...updateFields,
        isCumulative: args.isCumulative ?? existing.isCumulative,
        trackTime: args.trackTime ?? existing.trackTime,
        trackCount: args.trackCount ?? existing.trackCount,
        autoCountFromCalendar: args.autoCountFromCalendar ?? existing.autoCountFromCalendar,
        isRatingTracker: args.isRatingTracker ?? existing.isRatingTracker,
      } as any);
      return args.id;
    }

    const all = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const maxOrder = all.length > 0
      ? Math.max(...all.map((t) => t.orderIndex))
      : -1;

    const trackableId = await ctx.db.insert("trackables", {
      name: args.name,
      colour: args.colour,
      trackableType: args.trackableType,
      frequency: args.frequency,
      targetNumberOfHours: args.targetNumberOfHours,
      targetNumberOfDaysAWeek: args.targetNumberOfDaysAWeek,
      targetNumberOfMinutesAWeek: args.targetNumberOfMinutesAWeek,
      targetNumberOfWeeks: args.targetNumberOfWeeks,
      targetCount: args.targetCount,
      startDayYYYYMMDD: args.startDayYYYYMMDD,
      endDayYYYYMMDD: args.endDayYYYYMMDD,
      orderIndex: maxOrder + 1,
      userId: user._id,
      goalReasons: args.goalReasons,
      willAcceptPenalty: args.willAcceptPenalty,
      willDonateToCharity: args.willDonateToCharity,
      willSendMoneyToAFriend: args.willSendMoneyToAFriend,
      willPostOnSocialMedia: args.willPostOnSocialMedia,
      willShaveHead: args.willShaveHead,
      otherPenaltySelected: args.otherPenaltySelected,
      otherPenalties: args.otherPenalties,
      sendMoneyFriendName: args.sendMoneyFriendName,
      sendMoneyFriendAmount: args.sendMoneyFriendAmount,
      donateMoneyCharityAmount: args.donateMoneyCharityAmount,
      archived: false,
      isCumulative: args.isCumulative ?? true,
      trackTime: args.trackTime ?? true,
      trackCount: args.trackCount ?? true,
      autoCountFromCalendar: args.autoCountFromCalendar ?? true,
      isRatingTracker: args.isRatingTracker ?? false,
    });

    const listId = await ctx.db.insert("lists", {
      name: args.name,
      colour: args.colour,
      orderIndex: maxOrder + 1,
      userId: user._id,
      archived: false,
      isGoalList: true,
      showInSidebar: false,
      isInbox: false,
    });

    await ctx.db.insert("listSections", {
      listId,
      name: "Default",
      orderIndex: 0,
      isDefaultSection: true,
      userId: user._id,
    });

    await ctx.db.insert("listTrackableLinks", {
      listId,
      trackableId,
      userId: user._id,
    });

    await ctx.db.patch(trackableId, { listId });

    return trackableId;
  },
});

export const archive = mutation({
  args: { id: v.id("trackables") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const t = await ctx.db.get(args.id);
    if (!t || t.userId !== user._id) throw new Error("Trackable not found");
    await ctx.db.patch(args.id, { archived: !t.archived });
  },
});

export const move = mutation({
  args: { id: v.id("trackables"), newOrderIndex: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const trackable = await ctx.db.get(args.id);
    if (!trackable || trackable.userId !== user._id)
      throw new Error("Trackable not found");

    const all = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const sorted = all.sort((a, b) => a.orderIndex - b.orderIndex);
    const without = sorted.filter((t) => t._id !== args.id);
    without.splice(args.newOrderIndex, 0, trackable);

    for (let i = 0; i < without.length; i++) {
      if (without[i].orderIndex !== i) {
        await ctx.db.patch(without[i]._id, { orderIndex: i });
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("trackables") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const t = await ctx.db.get(args.id);
    if (!t || t.userId !== user._id) throw new Error("Trackable not found");

    const days = await ctx.db
      .query("trackableDays")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const d of days) await ctx.db.delete(d._id);

    const entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const e of entries) await ctx.db.delete(e._id);

    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);

    const shares = await ctx.db
      .query("trackableShares")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const s of shares) await ctx.db.delete(s._id);

    await ctx.db.delete(args.id);
  },
});

export const getGoalDetails = query({
  args: {
    activeOffset: v.optional(v.number()),
    archivedOffset: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const lim = args.limit ?? 20;

    const all = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const active = all
      .filter((t) => !t.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .slice(args.activeOffset ?? 0, (args.activeOffset ?? 0) + lim);

    const archived = all
      .filter((t) => t.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .slice(args.archivedOffset ?? 0, (args.archivedOffset ?? 0) + lim);

    const result = [];
    for (const trackable of [...active, ...archived]) {
      const timeWindows = await ctx.db
        .query("timeWindows")
        .withIndex("by_trackable", (q) =>
          q.eq("trackableId", trackable._id)
        )
        .collect();

      const totalSeconds = timeWindows
        .filter((w) => w.budgetType === "ACTUAL")
        .reduce((sum, w) => sum + w.durationSeconds, 0);

      const trackerEntries = await ctx.db
        .query("trackerEntries")
        .withIndex("by_trackable", (q) =>
          q.eq("trackableId", trackable._id)
        )
        .collect();

      const totalCount = trackerEntries.reduce(
        (sum, e) => sum + (e.countValue ?? 0),
        0
      );

      result.push({
        ...trackable,
        totalTimeSeconds: totalSeconds,
        totalCount,
        calendarCount: timeWindows.length,
        trackerEntryCount: trackerEntries.length,
      });
    }

    return {
      active: result.filter((r) => !r.archived),
      archived: result.filter((r) => r.archived),
      activeCount: all.filter((t) => !t.archived).length,
      archivedCount: all.filter((t) => t.archived).length,
    };
  },
});
