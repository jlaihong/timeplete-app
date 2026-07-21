import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  buildTaskInfoMap,
  firstActivityDayYYYYMMDD,
  timeWindowAttributedToTrackable,
} from "./_helpers/trackableAttribution";
import { isYYYYMMDDCompact, toCompactYYYYMMDD } from "./_helpers/compactYYYYMMDD";

export const search = query({
  args: { archived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

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
      const effectiveType =
        (args.trackableType ?? existing.trackableType) as
          | "NUMBER"
          | "TIME_TRACK"
          | "DAYS_A_WEEK"
          | "MINUTES_A_WEEK"
          | "TRACKER";
      if (effectiveType === "TRACKER") {
        (updateFields as Record<string, unknown>).targetCount = undefined;
        (updateFields as Record<string, unknown>).targetNumberOfHours =
          undefined;
        (updateFields as Record<string, unknown>).targetNumberOfDaysAWeek =
          undefined;
        (updateFields as Record<string, unknown>).targetNumberOfWeeks =
          undefined;
        (updateFields as Record<string, unknown>).targetNumberOfMinutesAWeek =
          undefined;
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

    const isTracker = args.trackableType === "TRACKER";

    const trackableId = await ctx.db.insert("trackables", {
      name: args.name,
      colour: args.colour,
      trackableType: args.trackableType,
      frequency: args.frequency,
      targetNumberOfHours: isTracker ? undefined : args.targetNumberOfHours,
      targetNumberOfDaysAWeek: isTracker
        ? undefined
        : args.targetNumberOfDaysAWeek,
      targetNumberOfMinutesAWeek: isTracker
        ? undefined
        : args.targetNumberOfMinutesAWeek,
      targetNumberOfWeeks: isTracker ? undefined : args.targetNumberOfWeeks,
      targetCount: isTracker ? undefined : args.targetCount,
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
      // Brand-new trackables have no history, so their week rollup is
      // trivially complete — readers may use `trackableWeekStats`
      // immediately (see schema doc).
      weekStatsSeeded: true,
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

    const daySeconds = await ctx.db
      .query("trackableDaySeconds")
      .withIndex("by_trackable_day", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const r of daySeconds) await ctx.db.delete(r._id);

    const weekStats = await ctx.db
      .query("trackableWeekStats")
      .withIndex("by_trackable_week", (q) => q.eq("trackableId", args.id))
      .collect();
    for (const r of weekStats) await ctx.db.delete(r._id);

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

function lexMaxYYYYMMDD(a: string, b: string): string {
  return a >= b ? a : b;
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
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

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
    /**
     * When set, the enriched row for this trackable is guaranteed to be
     * computed and returned as `focused` — even if it falls outside the
     * `active`/`archived` pagination window. Lets a single-trackable caller
     * (e.g. `EditTrackableDialog`) get the same enriched fields as the list
     * without duplicating this function's aggregation logic.
     */
    focusTrackableId: v.optional(v.id("trackables")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) {
      return {
        active: [],
        archived: [],
        activeCount: 0,
        archivedCount: 0,
        focused: null,
      };
    }

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

    const paginatedIds = new Set([...active, ...archived].map((t) => t._id));
    const focusTrackable =
      args.focusTrackableId && !paginatedIds.has(args.focusTrackableId)
        ? (all.find((t) => t._id === args.focusTrackableId) ?? null)
        : null;

    /*
     * Read-bandwidth strategy (fifth pass, Jul 2026):
     *
     * Everything this query serves now comes from denormalized data
     * maintained at write time by `_helpers/trackableLifetime`:
     *
     *   • Lifetime aggregates (`totalSeconds`, `calendarCount`,
     *     `trackerEntryCount`, `totalDayCount`, daily averages,
     *     `firstActivityDayYYYYMMDD`) — straight off the
     *     `trackable.lifetime*` fields.
     *   • Weekly / today seconds — per-trackable `trackableDaySeconds`
     *     rows bounded to the current week. This replaced the raw
     *     `timeWindows` scan + per-window task fetches +
     *     `listTrackableLinks` collect (~18 KB/fire on prod data).
     *     `trackableDaySeconds` uses single-bucket coalesce
     *     attribution while the old scan used the union predicate
     *     (`timeWindowAttributedToTrackable`); the two only diverge
     *     while a window's snapshot disagrees with its task's current
     *     attribution, and `resyncTaskWindowsOnAttributionChange`
     *     re-snapshots windows whenever that changes. Verified
     *     equivalent on all prod data (5-week window, per-day sums,
     *     zero diffs) by `_admin/tmpGoalDetailsAudit`.
     *   • Weekly pill / today counts — per-trackable `trackableDays`
     *     rows bounded to the current week
     *     (`attributedTaskCount` folds in task completions).
     *   • DAYS_A_WEEK / MINUTES_A_WEEK overall progress — the
     *     `trackableWeekStats` rollup (one compact row per active
     *     week: `activeDayMask` + `secondsByDay`). This replaced the
     *     unbounded per-day history scans, which were the largest
     *     remaining read (55 KB / 206 docs per fire for the heaviest
     *     user) and grew without bound as history accumulated.
     *
     * Per-fire reads are now O(current week) + O(active weeks in the
     * periodic range, ~150 B each) — nothing scales with raw history.
     */

    // Lower bound for the current-week reads (`trackableDaySeconds`,
    // `trackableDays`, `trackerEntries`). When no `weekStart` was
    // supplied fall back to a safely-low sentinel ("00000000" sorts
    // below every real day) so the bound is a no-op.
    let windowsLowerBound = "00000000";
    const weekStartCompact = args.weekStart
      ? toCompactYYYYMMDD(args.weekStart)
      : undefined;
    if (weekStartCompact && isYYYYMMDDCompact(weekStartCompact)) {
      windowsLowerBound = weekStartCompact;
    }

    // Build the 7 day strings of the current week (Mon-Sun) when we have a
    // weekStart. Widgets use this to render the day-of-week pill even when
    // there is no row in trackableDays for a given day.
    const todayArg = args.today ? toCompactYYYYMMDD(args.today) : undefined;
    const todayValid = todayArg !== undefined && isYYYYMMDDCompact(todayArg);
    const weekStartArg = args.weekStart
      ? toCompactYYYYMMDD(args.weekStart)
      : undefined;
    const weekDays: string[] = [];
    if (weekStartArg !== undefined && isYYYYMMDDCompact(weekStartArg)) {
      const monday = weekStartArg;
      for (let i = 0; i < 7; i++) {
        weekDays.push(addDaysYYYYMMDD(monday, i));
      }
    }
    const weekEnd = weekDays.length === 7 ? weekDays[6] : undefined;

    const result = [];
    const loopInput = focusTrackable
      ? [...active, ...archived, focusTrackable]
      : [...active, ...archived];
    for (const trackable of loopInput) {
      const startDay = toCompactYYYYMMDD(trackable.startDayYYYYMMDD);
      const endDay = toCompactYYYYMMDD(trackable.endDayYYYYMMDD);

      // Per-day attributed ACTUAL seconds for the current week —
      // replaces filtering the raw `timeWindows` scan per trackable.
      // Rows are keyed by compact days at write time.
      const weekDaySeconds = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_trackable_day", (q) =>
          q.eq("trackableId", trackable._id).gte("dayYYYYMMDD", windowsLowerBound!),
        )
        .collect();

      // Only TRACKER trackables fold tracker-entry time/values into
      // home aggregates.
      //
      // The p1-parity daily averages below are served from the
      // denormalized `lifetimeActiveTimeDayCount` /
      // `lifetimeCountActiveDayCount` / `lifetimeCountDaySumTotal` /
      // `lifetimeCountDayMeanTotal` fields (maintained by
      // `_helpers/trackableLifetime`, seeded by
      // `_admin/backfillTrackerAverages`), so the entry read stays
      // bounded to the current period. Until the backfill has run
      // (`lifetimeActiveTimeDayCount === undefined`) we fall back to
      // the legacy full-history scan so the UI stays correct.
      const isTracker = trackable.trackableType === "TRACKER";
      const averagesDenormalized =
        trackable.lifetimeActiveTimeDayCount !== undefined;
      const allTrackerEntries = isTracker
        ? (
            averagesDenormalized
              ? await ctx.db
                  .query("trackerEntries")
                  .withIndex("by_trackable_day", (q) =>
                    q
                      .eq("trackableId", trackable._id)
                      .gte("dayYYYYMMDD", windowsLowerBound!),
                  )
                  .collect()
              : await ctx.db
                  .query("trackerEntries")
                  .withIndex("by_trackable", (q) =>
                    q.eq("trackableId", trackable._id),
                  )
                  .collect()
          ).map((e) => ({
            ...e,
            dayYYYYMMDD: toCompactYYYYMMDD(e.dayYYYYMMDD),
          }))
        : [];
      // Current-period subset feeding the weekly / today aggregates.
      const trackerEntries = allTrackerEntries.filter(
        (e) => e.dayYYYYMMDD >= windowsLowerBound!,
      );

      // ----- Lifetime aggregates from denormalized fields ----------------
      //
      // These fields are maintained by `_helpers/trackableLifetime` on
      // every mutation that touches an attributed window /
      // trackableDays row / trackerEntries row / completed task. The
      // backfills in `_admin/backfillTrackableLifetime` and
      // `_admin/backfillAttributedTaskDayCount` seeded them from the
      // existing data.
      //
      // `timeWindowAttributedToTrackable` uses productivity-one union
      // attribution (window snapshot OR current task assignment).
      const totalSeconds = trackable.lifetimeTotalSeconds ?? 0;
      const calendarCount = trackable.lifetimeCalendarCount ?? 0;
      const totalEntryCount = trackable.lifetimeTrackerEntryCount ?? 0;
      const lifetimeTrackerEntryRowCount =
        trackable.lifetimeTrackerEntryRowCount ?? 0;
      const lifetimeStoredDayCount = trackable.lifetimeStoredDayCount ?? 0;
      const lifetimeAttributedTaskDayCount =
        trackable.lifetimeAttributedTaskDayCount ?? 0;
      const totalDayCount =
        lifetimeStoredDayCount + lifetimeAttributedTaskDayCount;

      // Week-scoped `trackableDays` rows feed the weekly pill + today
      // aggregates. Bounded to `windowsLowerBound` (the current week's
      // Monday when the client supplied `weekStart`, else the no-op
      // sentinel). The `attributedTaskCount` column folds in
      // task-completion contributions, so loop math just sums
      // `numCompleted + attributedTaskCount`. DAYS_A_WEEK overall
      // progress does its own bounded read further down.
      const trackableDays = (
        await ctx.db
          .query("trackableDays")
          .withIndex("by_trackable_day", (q) =>
            q
              .eq("trackableId", trackable._id)
              .gte("dayYYYYMMDD", windowsLowerBound!),
          )
          .collect()
      ).map((d) => ({
        ...d,
        dayYYYYMMDD: toCompactYYYYMMDD(d.dayYYYYMMDD),
        totalCount: d.numCompleted + (d.attributedTaskCount ?? 0),
      }));

      // Weekly day-completion strip — empty entries when no row exists for
      // a day. Always 7 elements when weekStart was provided. Each cell's
      // `numCompleted` already folds in attributed task completions via
      // `trackableDay.attributedTaskCount` (so a "days a week" goal
      // driven by task completion shows the right pill).
      const weeklyDayCompletion = weekDays.map((day) => {
        const row = trackableDays.find((d) => d.dayYYYYMMDD === day);
        return {
          dayYYYYMMDD: day,
          numCompleted: row?.totalCount ?? 0,
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
          ? weekDaySeconds
              .filter(
                (r) =>
                  r.dayYYYYMMDD >= weekDays[0] && r.dayYYYYMMDD <= weekEnd
              )
              .reduce((s, r) => s + r.attributedSeconds, 0) +
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
        todayValid
          ? weekDaySeconds
              .filter((r) => r.dayYYYYMMDD === todayArg)
              .reduce((s, r) => s + r.attributedSeconds, 0) +
            (trackable.trackableType === "TRACKER"
              ? trackerEntries
                  .filter((e) => e.dayYYYYMMDD === todayArg)
                  .reduce((s, e) => s + (e.durationSeconds ?? 0), 0)
              : 0)
          : 0;

      const todayDayCount =
        todayValid
          ? trackableDays
              .filter((d) => d.dayYYYYMMDD === todayArg)
              .reduce((s, d) => s + d.totalCount, 0)
          : 0;

      // p1 parity (`entries_by_date` in the legacy backend): a day's
      // count value is the SUM of its entries for cumulative trackers
      // and their MEAN otherwise (a Mood rating tracker's "today" is
      // today's average rating, not the sum). The widget renders this
      // with an "avg" suffix for non-cumulative trackers.
      let todayEntryCount = 0;
      if (todayValid) {
        const todayCountEntries = trackerEntries.filter(
          (e) =>
            e.dayYYYYMMDD === todayArg &&
            e.countValue !== undefined &&
            e.countValue !== null,
        );
        if (todayCountEntries.length > 0) {
          const sum = todayCountEntries.reduce(
            (s, e) => s + (e.countValue ?? 0),
            0,
          );
          todayEntryCount = trackable.isCumulative
            ? sum
            : sum / todayCountEntries.length;
        }
      }

      // Daily averages.
      //
      // TRACKER — productivity-one home `goal-widget` parity
      // (`calculatedCountDailyAverage` / `calculatedTimeDailyAverage`):
      // averages are over DAYS WITH ACTIVITY, not elapsed calendar days.
      //   • count avg/day: per-day value = sum of that day's entry
      //     countValues when `isCumulative`, else their mean (a Mood
      //     rating tracker's per-day value is that day's mean rating);
      //     the average is over days whose value > 0. A rating tracker
      //     therefore shows ~"average rating" (e.g. 7.4), not
      //     ratings-sum ÷ calendar days (0.4).
      //   • hrs/day avg: lifetime seconds ÷ distinct days that have an
      //     attributed window (`trackableDaySeconds` rows — one per
      //     active day, maintained at write time) or a timed entry.
      //
      // Other types keep the elapsed-calendar-days denominator anchored
      // to the FIRST day with activity (see `firstActivityDayYYYYMMDD`;
      // back-filled windows can pre-date `startDayYYYYMMDD` and would
      // otherwise distort the average).
      let dailyTimeAverageSeconds = 0;
      let dailyCountAverage = 0;
      if (isTracker && averagesDenormalized) {
        // Denormalized fast path — the four aggregates are maintained at
        // write time, so no per-day rows need to be read at all.
        const countDays = trackable.lifetimeCountActiveDayCount ?? 0;
        if (countDays > 0) {
          dailyCountAverage =
            (trackable.isCumulative
              ? trackable.lifetimeCountDaySumTotal ?? 0
              : trackable.lifetimeCountDayMeanTotal ?? 0) / countDays;
        }
        const timeDays = trackable.lifetimeActiveTimeDayCount ?? 0;
        if (timeDays > 0) {
          dailyTimeAverageSeconds = totalSeconds / timeDays;
        }
      } else if (isTracker) {
        // Legacy path — only until `_admin/backfillTrackerAverages` has
        // seeded the aggregates (`allTrackerEntries` holds the full
        // history in this branch).
        const perDayCount = new Map<string, { sum: number; n: number }>();
        for (const e of allTrackerEntries) {
          if (e.countValue === undefined || e.countValue === null) continue;
          if (!isYYYYMMDDCompact(e.dayYYYYMMDD)) continue;
          const agg = perDayCount.get(e.dayYYYYMMDD) ?? { sum: 0, n: 0 };
          agg.sum += e.countValue;
          agg.n += 1;
          perDayCount.set(e.dayYYYYMMDD, agg);
        }
        const dayValues: number[] = [];
        for (const { sum, n } of perDayCount.values()) {
          const value = trackable.isCumulative ? sum : sum / n;
          if (value > 0) dayValues.push(value);
        }
        if (dayValues.length > 0) {
          dailyCountAverage =
            dayValues.reduce((s, v) => s + v, 0) / dayValues.length;
        }

        const activeTimeDays = new Set<string>();
        const daySecondsRows = await ctx.db
          .query("trackableDaySeconds")
          .withIndex("by_trackable_day", (q) =>
            q.eq("trackableId", trackable._id),
          )
          .collect();
        for (const r of daySecondsRows) {
          if (r.attributedSeconds > 0) activeTimeDays.add(r.dayYYYYMMDD);
        }
        for (const e of allTrackerEntries) {
          if ((e.durationSeconds ?? 0) > 0) activeTimeDays.add(e.dayYYYYMMDD);
        }
        if (activeTimeDays.size > 0) {
          dailyTimeAverageSeconds = totalSeconds / activeTimeDays.size;
        }
      } else if (todayValid && isYYYYMMDDCompact(startDay)) {
        // Prefer the denormalized first-activity day — maintained on
        // every relevant write. Falls back to a bounded recomputation
        // for trackables whose row predates the backfill (all inputs
        // below are now week-scoped, so the fallback can only see
        // recent activity — acceptable because the backfill has run on
        // both deployments and new rows denormalize at write time).
        const denormFirst = trackable.firstActivityDayYYYYMMDD;
        const anchorDay =
          denormFirst && isYYYYMMDDCompact(denormFirst)
            ? denormFirst
            : firstActivityDayYYYYMMDD({
                // Week-bounded day-seconds rows stand in for the raw
                // windows here — this branch only runs for rows that
                // predate the `firstActivityDayYYYYMMDD` backfill, and
                // all inputs were already week-scoped.
                attributedWindows: weekDaySeconds.map((r) => ({
                  startDayYYYYMMDD: r.dayYYYYMMDD,
                })),
                trackerEntries,
                trackableDays,
                fallbackStartDay: startDay,
              });
        if (isYYYYMMDDCompact(anchorDay) && todayArg! >= anchorDay) {
          const elapsedDays = Math.max(
            1,
            diffDaysYYYYMMDD(anchorDay, todayArg!) + 1
          );
          dailyTimeAverageSeconds = totalSeconds / elapsedDays;
          dailyCountAverage = totalDayCount / elapsedDays;
        }
      }

      // `totalCount` is the user-facing "lifetime count":
      //   - TRACKER: sum of trackerEntries.countValue
      //   - everything else: sum of trackableDays.numCompleted
      const totalCount =
        trackable.trackableType === "TRACKER"
          ? totalEntryCount
          : totalDayCount;

      const boundsOk =
        isYYYYMMDDCompact(startDay) &&
        isYYYYMMDDCompact(endDay) &&
        startDay <= endDay;

      let periodicProgressCap: string | undefined;
      if (boundsOk) {
        if (!todayValid) {
          periodicProgressCap = endDay;
        } else {
          // `todayArg` comes from the client's wall clock (recomputed every
          // render in `TrackableList`). The previous implementation also
          // OR'd with a server-side `new Date()`, but reading wall-clock
          // time inside a Convex query is non-deterministic and breaks the
          // result cache, so we trust the client value here.
          const anchorThrough = todayArg!;
          if (anchorThrough < startDay) periodicProgressCap = undefined;
          else
            periodicProgressCap =
              anchorThrough <= endDay ? anchorThrough : endDay;
        }
      } else {
        periodicProgressCap = undefined;
      }

      // Overall bar (productivity-one `goal-widget.html`: `currentValue /
      // targetValue` on week scale). P1 credits a full target-week only when
      // weekly progress reaches the threshold:
      //   • COUPLE_DAYS_A_WEEK: `countPeriodicCompleted` (days with
      //     `numCompleted > 0`) meets `targetWeeklyValue` — see `periodicDiff`.
      //   • COUPLE_MINUTES_A_WEEK: summed weekly minutes meets target — see
      //     `buildMinutesAWeekGoalTimeChange`.
      // We emit `periodicOverallProgress` as (succeededWeeks × weeklyTarget) so
      // home widgets can keep dividing by weekly target to show whole-week units.
      let periodicOverallProgress = 0;
      const weekStatsSeeded = trackable.weekStatsSeeded === true;
      if (
        trackable.trackableType === "DAYS_A_WEEK" &&
        periodicProgressCap !== undefined &&
        periodicProgressCap >= startDay
      ) {
        const perWeekTarget = trackable.targetNumberOfDaysAWeek ?? 0;
        if (perWeekTarget > 0) {
          const firstMonday = startOfWeekYYYYMMDD(startDay);
          if (weekStatsSeeded) {
            // One compact rollup row per active week (`activeDayMask`)
            // instead of the per-day history scan, which grew without
            // bound (55 KB / 206 docs per fire on prod data).
            const weekRows = await ctx.db
              .query("trackableWeekStats")
              .withIndex("by_trackable_week", (q) =>
                q
                  .eq("trackableId", trackable._id)
                  .gte("weekMondayYYYYMMDD", firstMonday)
                  .lte("weekMondayYYYYMMDD", periodicProgressCap!),
              )
              .collect();
            const maskByMonday = new Map(
              weekRows.map((r) => [r.weekMondayYYYYMMDD, r.activeDayMask]),
            );
            let monday = firstMonday;
            while (monday <= periodicProgressCap) {
              const mask = maskByMonday.get(monday) ?? 0;
              let distinctActiveDays = 0;
              for (let i = 0; i < 7; i++) {
                if ((mask & (1 << i)) === 0) continue;
                const day = addDaysYYYYMMDD(monday, i);
                if (
                  day < startDay ||
                  day > endDay ||
                  day > periodicProgressCap
                )
                  continue;
                distinctActiveDays++;
              }
              if (distinctActiveDays >= perWeekTarget) {
                periodicOverallProgress += perWeekTarget;
              }
              monday = addDaysYYYYMMDD(monday, 7);
            }
          } else {
            // Legacy path until `_admin/backfillTrackableWeekStats`
            // seeds this trackable's rollup rows.
            const periodicDayRows = await ctx.db
              .query("trackableDays")
              .withIndex("by_trackable_day", (q) =>
                q
                  .eq("trackableId", trackable._id)
                  .gte("dayYYYYMMDD", firstMonday)
                  .lte("dayYYYYMMDD", periodicProgressCap!),
              )
              .collect();
            const byDay = new Map(
              periodicDayRows.map((d) => [
                toCompactYYYYMMDD(d.dayYYYYMMDD),
                { totalCount: d.numCompleted + (d.attributedTaskCount ?? 0) },
              ]),
            );
            let monday = firstMonday;
            while (monday <= periodicProgressCap) {
              let distinctActiveDays = 0;
              for (let i = 0; i < 7; i++) {
                const day = addDaysYYYYMMDD(monday, i);
                if (day < startDay || day > endDay || day > periodicProgressCap)
                  continue;
                const row = byDay.get(day);
                if ((row?.totalCount ?? 0) > 0) distinctActiveDays++;
              }
              if (distinctActiveDays >= perWeekTarget) {
                periodicOverallProgress += perWeekTarget;
              }
              monday = addDaysYYYYMMDD(monday, 7);
            }
          }
        }
      } else if (
        trackable.trackableType === "MINUTES_A_WEEK" &&
        periodicProgressCap !== undefined &&
        periodicProgressCap >= startDay
      ) {
        const perWeekMin = trackable.targetNumberOfMinutesAWeek ?? 0;
        if (perWeekMin > 0) {
          const firstMonday = startOfWeekYYYYMMDD(startDay);
          const secondsByDay = new Map<string, number>();
          if (weekStatsSeeded) {
            // Week rollup rows (`secondsByDay`) instead of the per-day
            // `trackableDaySeconds` scan over the full periodic range.
            const weekRows = await ctx.db
              .query("trackableWeekStats")
              .withIndex("by_trackable_week", (q) =>
                q
                  .eq("trackableId", trackable._id)
                  .gte("weekMondayYYYYMMDD", firstMonday)
                  .lte("weekMondayYYYYMMDD", periodicProgressCap!),
              )
              .collect();
            for (const r of weekRows) {
              const perDay = r.secondsByDay;
              if (!perDay) continue;
              for (let i = 0; i < 7; i++) {
                if (perDay[i] > 0) {
                  secondsByDay.set(
                    addDaysYYYYMMDD(r.weekMondayYYYYMMDD, i),
                    perDay[i],
                  );
                }
              }
            }
          } else {
            const dayRows = await ctx.db
              .query("trackableDaySeconds")
              .withIndex("by_trackable_day", (q) =>
                q
                  .eq("trackableId", trackable._id)
                  .gte("dayYYYYMMDD", firstMonday)
                  .lte("dayYYYYMMDD", periodicProgressCap!),
              )
              .collect();
            for (const r of dayRows) {
              secondsByDay.set(
                r.dayYYYYMMDD,
                (secondsByDay.get(r.dayYYYYMMDD) ?? 0) + r.attributedSeconds,
              );
            }
          }

          let monday = firstMonday;
          while (monday <= periodicProgressCap) {
            let weekSeconds = 0;
            for (let i = 0; i < 7; i++) {
              const day = addDaysYYYYMMDD(monday, i);
              if (
                day < startDay ||
                day > endDay ||
                day > periodicProgressCap
              )
                continue;
              weekSeconds += secondsByDay.get(day) ?? 0;
            }
            const weekMinutes = Math.floor(weekSeconds / 60);
            if (weekMinutes >= perWeekMin) {
              periodicOverallProgress += perWeekMin;
            }
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
        calendarCount,
        trackerEntryCount: lifetimeTrackerEntryRowCount,
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

    const paginatedResult = focusTrackable
      ? result.filter((r) => r._id !== args.focusTrackableId)
      : result;

    return {
      active: paginatedResult.filter((r) => !r.archived),
      archived: paginatedResult.filter((r) => r.archived),
      activeCount: all.filter((t) => !t.archived).length,
      archivedCount: all.filter((t) => t.archived).length,
      focused: args.focusTrackableId
        ? (result.find((r) => r._id === args.focusTrackableId) ?? null)
        : null,
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
    /**
     * YYYYMMDD of the user's local "today". Required so the lifetime
     * average denominators (`elapsedDays`) are computed deterministically
     * from a client-supplied value instead of `new Date()` inside the
     * query (which would be non-cacheable; see `no-date-now-in-queries`).
     * Optional only for backwards-compatibility with older bundles; new
     * clients always send it via `AnalyticsState`.
     */
    today: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) {
      return {
        windowStart: args.windowStart,
        windowEnd: args.windowEnd,
        trackables: [],
      };
    }

    const trackables = await ctx.db
      .query("trackables")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const userLinks = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(userLinks);

    const windowStart = toCompactYYYYMMDD(args.windowStart);
    const windowEnd = toCompactYYYYMMDD(args.windowEnd);

    // Bounded read strategy (verified equivalent to the old full-collect
    // path by `_admin/diagnoseTrackableAnalyticsSeries.compare`,
    // showing diffCount=0 across every trackable × field for both a
    // 1-day window and a year-wide window):
    //
    //   inWindow.*           — read bounded timeWindows / trackableDays /
    //                          trackerEntries via `by_user_day` /
    //                          `by_trackable_day` indexes to compute
    //                          the per-day series + `sumInWindow`.
    //   totalBeforePeriod.*  — derived as `trackable.lifetime* − inWindow.*`
    //                          using the denormalized lifetime fields
    //                          maintained by `_helpers/trackableLifetime`.
    //   lifetime.*           — read straight off the trackable doc.
    //   firstActivityDay     — read straight off the trackable doc
    //                          (the helper denormalizes it on every
    //                          window/day/entry write).
    //
    // The previous "collect everything since trackable.startDay" was a
    // ~1.34 MB read per call; the bounded version is 25 KB for a 1-day
    // window and ~115 KB for a 3-week window (measured by the diagnostic).
    // ACTUAL-only at the index — skips the BUDGETED calendar-planned
    // rows entirely instead of reading and dropping them.
    const boundedWindowsRaw = await ctx.db
      .query("timeWindows")
      .withIndex("by_user_budget_day", (q) =>
        q
          .eq("userId", user._id)
          .eq("budgetType", "ACTUAL")
          .gte("startDayYYYYMMDD", windowStart)
          .lte("startDayYYYYMMDD", windowEnd)
      )
      .collect();
    const boundedWindows = boundedWindowsRaw.map((w) => ({
      ...w,
      startDayYYYYMMDD: toCompactYYYYMMDD(w.startDayYYYYMMDD),
    }));

    // Task rows referenced by bounded windows — needed for union
    // attribution even when the window already carries a snapshot.
    const sparseTaskIds = new Set<Id<"tasks">>();
    for (const w of boundedWindows) {
      if (w.taskId) sparseTaskIds.add(w.taskId);
    }
    const sparseTaskDocs = await Promise.all(
      Array.from(sparseTaskIds).map((id) => ctx.db.get(id))
    );
    const taskInfoMap = buildTaskInfoMap(
      sparseTaskDocs.filter(
        (t): t is NonNullable<typeof t> => t !== null
      )
    );

    // Build the window's day list once.
    const windowDays: string[] = [];
    {
      const span = diffDaysYYYYMMDD(windowStart, windowEnd);
      for (let i = 0; i <= span; i++) {
        windowDays.push(addDaysYYYYMMDD(windowStart, i));
      }
    }

    const result = await Promise.all(
      trackables
        .filter((t) => !t.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(async (trackable) => {
          const attributedWindows = boundedWindows.filter((w) =>
            timeWindowAttributedToTrackable(
              w,
              trackable._id,
              taskInfoMap,
              listIdToTrackableId
            )
          );

          const isTracker = trackable.trackableType === "TRACKER";

          // Bounded per-trackable reads — only the rows that fall inside
          // [windowStart, windowEnd]. The lifetime totals are read off
          // the denormalized trackable doc, so we never need to scan
          // anything older than `windowStart`.
          const tDaysRaw = await ctx.db
            .query("trackableDays")
            .withIndex("by_trackable_day", (q) =>
              q
                .eq("trackableId", trackable._id)
                .gte("dayYYYYMMDD", windowStart)
                .lte("dayYYYYMMDD", windowEnd)
            )
            .collect();
          const tDays = tDaysRaw.map((d) => ({
            ...d,
            dayYYYYMMDD: toCompactYYYYMMDD(d.dayYYYYMMDD),
          }));

          // `trackerEntries` are only meaningful for TRACKER trackables —
          // skip the read entirely for the others.
          const tEntries = isTracker
            ? (
                await ctx.db
                  .query("trackerEntries")
                  .withIndex("by_trackable_day", (q) =>
                    q
                      .eq("trackableId", trackable._id)
                      .gte("dayYYYYMMDD", windowStart)
                      .lte("dayYYYYMMDD", windowEnd)
                  )
                  .collect()
              ).map((e) => ({
                ...e,
                dayYYYYMMDD: toCompactYYYYMMDD(e.dayYYYYMMDD),
              }))
            : [];

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
            // marked complete that day. The task augment is now read off
            // the denormalized `trackableDays.attributedTaskCount` field
            // maintained by `onTaskCompletionAttribution`.
            const dayRows = tDays.filter((d) => d.dayYYYYMMDD === day);
            const storedDayCount = dayRows.reduce(
              (s, d) => s + d.numCompleted,
              0
            );
            const taskDayCount = dayRows.reduce(
              (s, d) => s + (d.attributedTaskCount ?? 0),
              0
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
            // attributedWindows is already bounded to the window — no
            // need for the post-filter.
            calendarEvents: attributedWindows.length,
          };

          // Denormalized lifetime totals. These are exact equivalents of
          // the old `tDays.reduce(...) + sumCompletedTaskCounts(...)`
          // / `tEntries.reduce(...)` aggregates the previous handler
          // produced — verified field-by-field with diffCount=0 by
          // `_admin/diagnoseTrackableAnalyticsSeries.compare`.
          const lifetimeEntrySeconds = trackable.lifetimeTrackerEntrySeconds ?? 0;
          // `lifetimeTotalSeconds` already includes entry seconds for
          // TRACKER trackables (see `_helpers/trackableLifetime`
          // docstring) — same TRACKER fold the old handler applied
          // post-aggregate.
          const totalSeconds = trackable.lifetimeTotalSeconds ?? 0;
          const totalDayCount =
            (trackable.lifetimeStoredDayCount ?? 0) +
            (trackable.lifetimeAttributedTaskDayCount ?? 0);
          const totalEntryCount = trackable.lifetimeTrackerEntryCount ?? 0;
          const totalEntrySeconds = lifetimeEntrySeconds;

          // "Before period" baseline — derived as `lifetime − inWindow`
          // so we don't have to read any pre-window rows.
          const totalBeforePeriod = {
            secondsAttributed:
              totalSeconds - sumInWindow.secondsAttributed,
            daysCompleted: totalDayCount - sumInWindow.daysCompleted,
            trackerCount: totalEntryCount - sumInWindow.trackerCount,
            trackerSeconds: totalEntrySeconds - sumInWindow.trackerSeconds,
          };

          // Lifetime averages (per week / month / year). Anchored to
          // the trackable's FIRST activity day (not its `startDayYYYYMMDD`)
          // — same reason as `getGoalDetails`, see
          // `firstActivityDayYYYYMMDD`. The helper denormalizes the
          // anchor on every window/day/entry write, falling back to
          // `startDayYYYYMMDD` when no activity has been logged yet.
          //
          // `today` is provided by the client (deterministic + cacheable);
          // when older bundles omit it we fall back to `windowEnd` so the
          // denominator is still bounded (yields the same value the page is
          // displaying for "current window end" rather than a server-side
          // wall-clock read).
          const today = args.today
            ? toCompactYYYYMMDD(args.today)
            : windowEnd;
          const startDay = toCompactYYYYMMDD(trackable.startDayYYYYMMDD);
          const anchorDay =
            trackable.firstActivityDayYYYYMMDD ?? startDay;
          const elapsedDays = Math.max(
            1,
            diffDaysYYYYMMDD(anchorDay, today) + 1
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
        })
    );

    return {
      windowStart: args.windowStart,
      windowEnd: args.windowEnd,
      trackables: result,
    };
  },
});

