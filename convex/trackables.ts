import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";
import {
  buildCompletedTaskCountsByTrackableDay,
  buildListIdToTrackableId,
  buildTaskInfoMap,
  getCompletedTaskCount,
  sumCompletedTaskCounts,
  timeWindowAttributedToTrackable,
} from "./_helpers/trackableAttribution";
import { toCompactYYYYMMDD } from "./_helpers/compactYYYYMMDD";

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

      const { id, ...rest } = args;
      const updateFields: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rest)) {
        if (val !== undefined) (updateFields as Record<string, unknown>)[key] = val;
      }
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

/** Monday 00:00 boundary (productivity-one week), YYYYMMDD. */
function startOfWeekYYYYMMDD(yyyymmdd: string): string {
  const y = parseInt(yyyymmdd.substring(0, 4));
  const m = parseInt(yyyymmdd.substring(4, 6)) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8));
  const date = new Date(y, m, d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  const yy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Add `days` to an 8-char YYYYMMDD string, returning another YYYYMMDD. */
function addDaysYYYYMMDD(yyyymmdd: string, days: number): string {
  const y = parseInt(yyyymmdd.substring(0, 4));
  const m = parseInt(yyyymmdd.substring(4, 6)) - 1;
  const d = parseInt(yyyymmdd.substring(6, 8));
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + days);
  const yy = date.getFullYear().toString();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

function diffDaysYYYYMMDD(start: string, end: string): number {
  const sy = parseInt(start.substring(0, 4));
  const sm = parseInt(start.substring(4, 6)) - 1;
  const sd = parseInt(start.substring(6, 8));
  const ey = parseInt(end.substring(0, 4));
  const em = parseInt(end.substring(4, 6)) - 1;
  const ed = parseInt(end.substring(6, 8));
  const a = new Date(sy, sm, sd).getTime();
  const b = new Date(ey, em, ed).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Names of tasks the user marked complete on `dayYYYYMMDD` that attribute to
 * `trackableId` (via the same resolution chain as `timeWindowAttributedToTrackable`:
 * direct `task.trackableId`, else `task.listId` → `listTrackableLinks`).
 *
 * Mirror of productivity-one's `getCompletedTaskNames(dayYYYYMMDD)` helper
 * inside `goal-widget.ts` and `day-of-week-completion-widget.ts`. Used by
 * `TrackPeriodicDialog` (display) and `TrackCountDialog` (display + saved
 * count is reduced by `completedTaskNames.length` so we don't double-count
 * tasks that already auto-credit the trackable).
 */
export const getCompletedTaskNamesForDay = query({
  args: {
    trackableId: v.id("trackables"),
    dayYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(links);

    const dayCompact = toCompactYYYYMMDD(args.dayYYYYMMDD);
    return tasks
      .filter(
        (t) =>
          t.dateCompleted != null &&
          toCompactYYYYMMDD(t.dateCompleted) === dayCompact
      )
      .filter((t) => {
        if (t.trackableId === args.trackableId) return true;
        if (t.listId && listIdToTrackableId.get(t.listId) === args.trackableId)
          return true;
        return false;
      })
      .map((t) => t.name);
  },
});

export const getGoalDetails = query({
  args: {
    activeOffset: v.optional(v.number()),
    archivedOffset: v.optional(v.number()),
    limit: v.optional(v.number()),
    /** YYYYMMDD (no dashes). Required for today / weekly stats. */
    today: v.optional(v.string()),
    /** YYYYMMDD of Monday this week. Required for weekly stats. */
    weekStart: v.optional(v.string()),
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

    const userTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const taskInfoMap = buildTaskInfoMap(userTasks);

    const userLinks = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(userLinks);

    // Per-(trackable, day) attributed task completion counts. See
    // `getTrackableAnalyticsSeries` for the full rationale; the
    // short version is that P1 counts a task-completion as "1
    // completed day" toward the trackable, and our migration
    // doesn't fold those into `trackableDays.numCompleted`.
    const taskCountsByTrackableDay = buildCompletedTaskCountsByTrackableDay(
      userTasks,
      listIdToTrackableId
    );

    const allUserWindows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const actualWindows = allUserWindows.filter(
      (w) => w.budgetType === "ACTUAL"
    );
    const normalizedWindows = actualWindows.map((w) => ({
      ...w,
      startDayYYYYMMDD: toCompactYYYYMMDD(w.startDayYYYYMMDD),
    }));

    // Pre-fetch trackableDays / trackerEntries for all trackables so we
    // don't N+1 inside the loop.
    const allDays = await ctx.db
      .query("trackableDays")
      .withIndex("by_user_trackable", (q) => q.eq("userId", user._id))
      .collect();
    const daysByTrackable = new Map<string, typeof allDays>();
    for (const d of allDays) {
      const arr = daysByTrackable.get(d.trackableId) ?? [];
      arr.push(d);
      daysByTrackable.set(d.trackableId, arr);
    }

    // Build the 7 day strings of the current week (Mon-Sun) when we have a
    // weekStart. Widgets use this to render the day-of-week pill even when
    // there is no row in trackableDays for a given day.
    const todayArg = args.today ? toCompactYYYYMMDD(args.today) : undefined;
    const weekStartArg = args.weekStart
      ? toCompactYYYYMMDD(args.weekStart)
      : undefined;
    const weekDays: string[] = [];
    if (weekStartArg && weekStartArg.length === 8) {
      for (let i = 0; i < 7; i++) {
        weekDays.push(addDaysYYYYMMDD(weekStartArg, i));
      }
    }
    const weekEnd = weekDays.length === 7 ? weekDays[6] : undefined;

    const result = [];
    for (const trackable of [...active, ...archived]) {
      const startDay = toCompactYYYYMMDD(trackable.startDayYYYYMMDD);
      const endDay = toCompactYYYYMMDD(trackable.endDayYYYYMMDD);

      const attributedWindows = normalizedWindows.filter((w) =>
        timeWindowAttributedToTrackable(
          w,
          trackable._id,
          taskInfoMap,
          listIdToTrackableId
        )
      );

      const trackerEntries = (
        await ctx.db
          .query("trackerEntries")
          .withIndex("by_trackable", (q) =>
            q.eq("trackableId", trackable._id)
          )
          .collect()
      ).map((e) => ({
        ...e,
        dayYYYYMMDD: toCompactYYYYMMDD(e.dayYYYYMMDD),
      }));

      const totalEntryCount = trackerEntries.reduce(
        (sum, e) => sum + (e.countValue ?? 0),
        0
      );

      // Time totals fold in `trackerEntries.durationSeconds` for TRACKER
      // trackables. Mirrors productivity-one: the REST backend's
      // `search-time-windows` endpoint synthesises TimeWindow-shaped
      // rows from each TrackerEntry that has a duration, so home and
      // analytics widgets see manual tracker time alongside timer
      // sessions. Without this, "Add progress → 1h 37m" silently
      // disappears from every time stat (#bugfix).
      const trackerEntrySecondsTotal =
        trackable.trackableType === "TRACKER"
          ? trackerEntries.reduce(
              (sum, e) => sum + (e.durationSeconds ?? 0),
              0
            )
          : 0;
      const totalSeconds =
        attributedWindows.reduce((sum, w) => sum + w.durationSeconds, 0) +
        trackerEntrySecondsTotal;

      const trackableDays = (daysByTrackable.get(trackable._id) ?? []).map(
        (d) => ({
          ...d,
          dayYYYYMMDD: toCompactYYYYMMDD(d.dayYYYYMMDD),
        })
      );
      // Lifetime count = stored manual numCompleted + lifetime
      // attributed task completions. Mirrors P1.
      const lifetimeTaskDayCount = sumCompletedTaskCounts(
        taskCountsByTrackableDay,
        trackable._id,
        null,
        null
      );
      const totalDayCount =
        trackableDays.reduce((s, d) => s + d.numCompleted, 0) +
        lifetimeTaskDayCount;

      // Weekly day-completion strip — empty entries when no row exists for
      // a day. Always 7 elements when weekStart was provided. Each cell's
      // `numCompleted` is augmented with attributed task completions for
      // that day (so a "days a week" goal driven by task completion shows
      // the right pill).
      const weeklyDayCompletion = weekDays.map((day) => {
        const row = trackableDays.find((d) => d.dayYYYYMMDD === day);
        const taskCount = getCompletedTaskCount(
          taskCountsByTrackableDay,
          trackable._id,
          day
        );
        return {
          dayYYYYMMDD: day,
          numCompleted: (row?.numCompleted ?? 0) + taskCount,
          comments: row?.comments ?? "",
        };
      });
      const currentWeekCompletedDays = weeklyDayCompletion.filter(
        (d) => d.numCompleted > 0
      ).length;

      // Weekly seconds — only meaningful when weekStart is supplied.
      // Includes manual tracker entry time for TRACKER trackables (see
      // note on `totalSeconds` above).
      const weeklySeconds =
        weekDays.length === 7 && weekEnd
          ? attributedWindows
              .filter(
                (w) =>
                  w.startDayYYYYMMDD >= weekDays[0] &&
                  w.startDayYYYYMMDD <= weekEnd
              )
              .reduce((s, w) => s + w.durationSeconds, 0) +
            (trackable.trackableType === "TRACKER"
              ? trackerEntries
                  .filter(
                    (e) =>
                      e.dayYYYYMMDD >= weekDays[0] &&
                      e.dayYYYYMMDD <= weekEnd
                  )
                  .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
              : 0)
          : 0;

      // Today values — only computed when caller passed `today`.
      const todaySeconds =
        todayArg && todayArg.length === 8
          ? attributedWindows
              .filter((w) => w.startDayYYYYMMDD === todayArg)
              .reduce((s, w) => s + w.durationSeconds, 0) +
            (trackable.trackableType === "TRACKER"
              ? trackerEntries
                  .filter((e) => e.dayYYYYMMDD === todayArg)
                  .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
              : 0)
          : 0;

      const todayDayCount =
        todayArg && todayArg.length === 8
          ? trackableDays
              .filter((d) => d.dayYYYYMMDD === todayArg)
              .reduce((s, d) => s + d.numCompleted, 0) +
            getCompletedTaskCount(
              taskCountsByTrackableDay,
              trackable._id,
              todayArg
            )
          : 0;

      const todayEntryCount =
        todayArg && todayArg.length === 8
          ? trackerEntries
              .filter((e) => e.dayYYYYMMDD === todayArg)
              .reduce((s, e) => s + (e.countValue ?? 0), 0)
          : 0;

      // Daily averages — windowed from the trackable's start to today,
      // clamped to at least 1 day so we never divide by zero.
      let dailyTimeAverageSeconds = 0;
      let dailyCountAverage = 0;
      if (todayArg && todayArg.length === 8) {
        const elapsedDays = Math.max(
          1,
          diffDaysYYYYMMDD(startDay, todayArg) + 1
        );
        dailyTimeAverageSeconds = totalSeconds / elapsedDays;
        // Use entry-count for trackers, day-count otherwise.
        const totalCountForAvg =
          trackable.trackableType === "TRACKER"
            ? totalEntryCount
            : totalDayCount;
        dailyCountAverage = totalCountForAvg / elapsedDays;
      }

      // `totalCount` is the user-facing "lifetime count":
      //   - TRACKER: sum of trackerEntries.countValue
      //   - everything else: sum of trackableDays.numCompleted
      const totalCount =
        trackable.trackableType === "TRACKER"
          ? totalEntryCount
          : totalDayCount;

      const progressCap =
        todayArg &&
        todayArg.length === 8 &&
        todayArg >= startDay &&
        todayArg <= endDay
          ? todayArg
          : endDay;

      // Per-week capped credits (day-count or minutes) summed through today.
      // The home widget divides by the weekly target and shows progress vs
      // `targetNumberOfWeeks` — productivity-one's week-scale overall bar.
      let periodicOverallProgress = 0;
      if (
        trackable.trackableType === "DAYS_A_WEEK" &&
        progressCap >= startDay
      ) {
        const perWeekTarget = trackable.targetNumberOfDaysAWeek ?? 0;
        if (perWeekTarget > 0) {
          const byDay = new Map(
            trackableDays.map((d) => [d.dayYYYYMMDD, d])
          );
          let monday = startOfWeekYYYYMMDD(startDay);
          while (monday <= progressCap) {
            let daysWithActivity = 0;
            for (let i = 0; i < 7; i++) {
              const day = addDaysYYYYMMDD(monday, i);
              if (day < startDay || day > endDay || day > progressCap)
                continue;
              const row = byDay.get(day);
              const tc = getCompletedTaskCount(
                taskCountsByTrackableDay,
                trackable._id,
                day
              );
              if ((row?.numCompleted ?? 0) + tc > 0) daysWithActivity++;
            }
            periodicOverallProgress += Math.min(
              daysWithActivity,
              perWeekTarget
            );
            monday = addDaysYYYYMMDD(monday, 7);
          }
        }
      } else if (
        trackable.trackableType === "MINUTES_A_WEEK" &&
        progressCap >= startDay
      ) {
        const perWeekMin = trackable.targetNumberOfMinutesAWeek ?? 0;
        if (perWeekMin > 0) {
          let monday = startOfWeekYYYYMMDD(startDay);
          while (monday <= progressCap) {
            const weekEndDay = addDaysYYYYMMDD(monday, 6);
            let weekSeconds = 0;
            for (const w of attributedWindows) {
              if (
                w.startDayYYYYMMDD >= monday &&
                w.startDayYYYYMMDD <= weekEndDay &&
                w.startDayYYYYMMDD >= startDay &&
                w.startDayYYYYMMDD <= endDay &&
                w.startDayYYYYMMDD <= progressCap
              ) {
                weekSeconds += w.durationSeconds;
              }
            }
            periodicOverallProgress += Math.min(
              Math.floor(weekSeconds / 60),
              perWeekMin
            );
            monday = addDaysYYYYMMDD(monday, 7);
          }
        }
      }

      result.push({
        ...trackable,
        totalTimeSeconds: totalSeconds,
        totalCount,
        totalEntryCount,
        totalDayCount,
        calendarCount: attributedWindows.length,
        trackerEntryCount: trackerEntries.length,
        weeklyDayCompletion,
        currentWeekCompletedDays,
        weeklySeconds,
        todaySeconds,
        todayDayCount,
        todayEntryCount,
        dailyTimeAverageSeconds,
        dailyCountAverage,
        periodicOverallProgress,
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

/* ──────────────────────────────────────────────────────────────────── *
 * Analytics-series query — per-day buckets per trackable for an
 * arbitrary window. Used ONLY by the Analytics page's analytics-
 * specific widgets (line charts, weekly pills, etc.).
 *
 * Aggregation logic is intentionally identical to `getGoalDetails`
 * (same union attribution via `timeWindowAttributedToTrackable`,
 * same trackableDays / trackerEntries handling). The Analytics widgets
 * therefore can never disagree with the home-page widgets on shared
 * data (e.g. "today's count" must match for both UIs).
 *
 * Returns:
 *   {
 *     trackables: Array<{
 *       _id, name, colour, trackableType, frequency, targets…,
 *       days: Array<{ day, secondsAttributed, daysCompleted,
 *                     trackerCount, trackerSeconds }>,
 *       sumInWindow:   { secondsAttributed, daysCompleted,
 *                        trackerCount, trackerSeconds, calendarEvents },
 *       totalBeforePeriod: same shape (state at `windowStart - 1`),
 *       weeklyAverage:  count avg per week (used by COUPLE_DAYS_A_WEEK,
 *                       COUPLE_MINUTES_A_WEEK, NUMBER, TRACKER count),
 *       monthlyAverage: avg per month,
 *       yearlyAverage:  avg per year,
 *       dailyTimeAverageSeconds, dailyCountAverage,
 *     }>
 *   }
 * ──────────────────────────────────────────────────────────────────── */
export const getTrackableAnalyticsSeries = query({
  args: {
    windowStart: v.string(),
    windowEnd: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const trackables = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const userTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const taskInfoMap = buildTaskInfoMap(userTasks);

    const userLinks = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(userLinks);

    const windowStart = toCompactYYYYMMDD(args.windowStart);
    const windowEnd = toCompactYYYYMMDD(args.windowEnd);

    // Per-(trackable, day) count of attributed task completions.
    // Mirrors P1's `TrackableDay.completedTaskNames.length` augment
    // — without it, "days a week" trackables driven entirely by
    // task completion show 0/N. See helper docstring for the full
    // rationale.
    const taskCountsByTrackableDay = buildCompletedTaskCountsByTrackableDay(
      userTasks,
      listIdToTrackableId
    );

    const allWindows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const actualWindows = allWindows.filter(
      (w) => w.budgetType === "ACTUAL"
    );
    const normalizedWindows = actualWindows.map((w) => ({
      ...w,
      startDayYYYYMMDD: toCompactYYYYMMDD(w.startDayYYYYMMDD),
    }));

    const allDays = await ctx.db
      .query("trackableDays")
      .withIndex("by_user_trackable", (q) => q.eq("userId", user._id))
      .collect();
    const daysByTrackable = new Map<string, typeof allDays>();
    for (const d of allDays) {
      const arr = daysByTrackable.get(d.trackableId) ?? [];
      arr.push(d);
      daysByTrackable.set(d.trackableId, arr);
    }

    const allTrackerEntries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const trackerByTrackable = new Map<string, typeof allTrackerEntries>();
    for (const e of allTrackerEntries) {
      const arr = trackerByTrackable.get(e.trackableId) ?? [];
      arr.push(e);
      trackerByTrackable.set(e.trackableId, arr);
    }

    // Build the window's day list once.
    const windowDays: string[] = [];
    {
      const span = diffDaysYYYYMMDD(windowStart, windowEnd);
      for (let i = 0; i <= span; i++) {
        windowDays.push(addDaysYYYYMMDD(windowStart, i));
      }
    }

    const result = trackables
      .filter((t) => !t.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((trackable) => {
        const attributedWindows = normalizedWindows.filter((w) =>
          timeWindowAttributedToTrackable(
            w,
            trackable._id,
            taskInfoMap,
            listIdToTrackableId
          )
        );

        const tDays = (daysByTrackable.get(trackable._id) ?? []).map((d) => ({
          ...d,
          dayYYYYMMDD: toCompactYYYYMMDD(d.dayYYYYMMDD),
        }));
        const tEntries = (trackerByTrackable.get(trackable._id) ?? []).map(
          (e) => ({
            ...e,
            dayYYYYMMDD: toCompactYYYYMMDD(e.dayYYYYMMDD),
          })
        );

        const isTracker = trackable.trackableType === "TRACKER";

        // Per-day buckets within the window.
        //
        // For TRACKER trackables `secondsAttributed` includes BOTH the
        // attributed timer windows AND `trackerEntries.durationSeconds`
        // logged via the "Add progress" dialog. Mirrors P1's
        // `search-time-windows` merge so home + analytics widgets agree
        // on how much time was spent (#bugfix).
        //
        // `trackerSeconds` is kept separate for callers that want the
        // raw entry-only number (currently unused — every widget uses
        // `secondsAttributed`).
        const days = windowDays.map((day) => {
          const winSeconds = attributedWindows
            .filter((w) => w.startDayYYYYMMDD === day)
            .reduce((s, w) => s + w.durationSeconds, 0);
          // `daysCompleted` = stored `trackableDays.numCompleted` for
          // the day + the count of tasks attributed to this trackable
          // marked complete that day. Mirrors P1 — see helper docstring.
          const storedDayCount = tDays
            .filter((d) => d.dayYYYYMMDD === day)
            .reduce((s, d) => s + d.numCompleted, 0);
          const taskDayCount = getCompletedTaskCount(
            taskCountsByTrackableDay,
            trackable._id,
            day
          );
          const daysCompleted = storedDayCount + taskDayCount;
          const trackerCount = tEntries
            .filter((e) => e.dayYYYYMMDD === day)
            .reduce((s, e) => s + (e.countValue ?? 0), 0);
          const trackerSeconds = tEntries
            .filter((e) => e.dayYYYYMMDD === day)
            .reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
          return {
            day,
            secondsAttributed: winSeconds + (isTracker ? trackerSeconds : 0),
            daysCompleted,
            trackerCount,
            trackerSeconds,
          };
        });

        const sumInWindow = {
          secondsAttributed: days.reduce(
            (s, d) => s + d.secondsAttributed,
            0
          ),
          daysCompleted: days.reduce((s, d) => s + d.daysCompleted, 0),
          trackerCount: days.reduce((s, d) => s + d.trackerCount, 0),
          trackerSeconds: days.reduce((s, d) => s + d.trackerSeconds, 0),
          calendarEvents: attributedWindows.filter(
            (w) =>
              w.startDayYYYYMMDD >= windowStart &&
              w.startDayYYYYMMDD <= windowEnd
          ).length,
        };

        // "Before period" baseline — state at `windowStart - 1`, used by
        // monthly/yearly cumulative line charts. Same TRACKER fold as
        // `secondsAttributed` so cumulative chart bases line up.
        const beforeEntrySeconds = tEntries
          .filter((e) => e.dayYYYYMMDD < windowStart)
          .reduce((s, e) => s + (e.durationSeconds ?? 0), 0);
        // `daysCompleted` baseline includes task completions before
        // the window — same augment as the per-day calc above.
        const beforeWindowEnd = addDaysYYYYMMDD(windowStart, -1);
        const taskDaysBefore = sumCompletedTaskCounts(
          taskCountsByTrackableDay,
          trackable._id,
          null,
          beforeWindowEnd
        );
        const totalBeforePeriod = {
          secondsAttributed:
            attributedWindows
              .filter((w) => w.startDayYYYYMMDD < windowStart)
              .reduce((s, w) => s + w.durationSeconds, 0) +
            (isTracker ? beforeEntrySeconds : 0),
          daysCompleted:
            tDays
              .filter((d) => d.dayYYYYMMDD < windowStart)
              .reduce((s, d) => s + d.numCompleted, 0) + taskDaysBefore,
          trackerCount: tEntries
            .filter((e) => e.dayYYYYMMDD < windowStart)
            .reduce((s, e) => s + (e.countValue ?? 0), 0),
          trackerSeconds: beforeEntrySeconds,
        };

        // Lifetime averages (per week / month / year). Computed from the
        // trackable's start day to today so they're stable regardless of
        // the analytics window the user is viewing — same numbers shown
        // on whatever tab/date.
        const today = todayYYYYMMDD();
        const startDay = toCompactYYYYMMDD(trackable.startDayYYYYMMDD);
        const elapsedDays = Math.max(
          1,
          diffDaysYYYYMMDD(startDay, today) + 1
        );
        const lifetimeEntrySeconds = tEntries.reduce(
          (s, e) => s + (e.durationSeconds ?? 0),
          0
        );
        // Same TRACKER fold as everywhere else — analytics totals must
        // match home `goal.totalTimeSeconds`.
        const totalSeconds =
          attributedWindows.reduce((s, w) => s + w.durationSeconds, 0) +
          (isTracker ? lifetimeEntrySeconds : 0);
        // Lifetime `totalDayCount` includes task completions, same
        // augment as the per-day calc — keeps weekly/monthly/yearly
        // averages on parity with P1's `getTrackableProgressionStats`
        // which counts task-driven progress as completed days.
        const lifetimeTaskDayCount = sumCompletedTaskCounts(
          taskCountsByTrackableDay,
          trackable._id,
          null,
          null
        );
        const totalDayCount =
          tDays.reduce((s, d) => s + d.numCompleted, 0) + lifetimeTaskDayCount;
        const totalEntryCount = tEntries.reduce(
          (s, e) => s + (e.countValue ?? 0),
          0
        );
        const totalEntrySeconds = tEntries.reduce(
          (s, e) => s + (e.durationSeconds ?? 0),
          0
        );

        const dailyTimeAverageSeconds = totalSeconds / elapsedDays;
        const dailyCountAverage =
          (trackable.trackableType === "TRACKER"
            ? totalEntryCount
            : totalDayCount) / elapsedDays;
        const weeklyAverage =
          (trackable.trackableType === "TRACKER"
            ? totalEntryCount
            : totalDayCount) / Math.max(1, elapsedDays / 7);
        const monthlyAverage =
          (trackable.trackableType === "TRACKER"
            ? totalEntryCount
            : totalDayCount) / Math.max(1, elapsedDays / 30);
        const yearlyAverage =
          (trackable.trackableType === "TRACKER"
            ? totalEntryCount
            : totalDayCount) / Math.max(1, elapsedDays / 365);
        const weeklyTimeAverageSeconds =
          totalSeconds / Math.max(1, elapsedDays / 7);

        return {
          _id: trackable._id,
          name: trackable.name,
          colour: trackable.colour,
          trackableType: trackable.trackableType,
          frequency: trackable.frequency,
          targetNumberOfDaysAWeek: trackable.targetNumberOfDaysAWeek,
          targetNumberOfMinutesAWeek: trackable.targetNumberOfMinutesAWeek,
          targetCount: trackable.targetCount,
          targetNumberOfHours: trackable.targetNumberOfHours,
          trackTime: trackable.trackTime,
          trackCount: trackable.trackCount,
          isCumulative: trackable.isCumulative,
          isRatingTracker: trackable.isRatingTracker,
          startDayYYYYMMDD: trackable.startDayYYYYMMDD,
          endDayYYYYMMDD: trackable.endDayYYYYMMDD,
          days,
          sumInWindow,
          totalBeforePeriod,
          weeklyAverage,
          monthlyAverage,
          yearlyAverage,
          dailyTimeAverageSeconds,
          dailyCountAverage,
          weeklyTimeAverageSeconds,
          // Surface lifetime totals so widgets can show "Total: …" rows
          // without a second trip.
          lifetime: {
            totalSeconds,
            totalDayCount,
            totalEntryCount,
            totalEntrySeconds,
          },
        };
      });

    return {
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      trackables: result,
    };
  },
});

function todayYYYYMMDD(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}
