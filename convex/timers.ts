import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import { resolveActiveTimerCalendarDisplay } from "./_helpers/activeTimerCalendarDisplay";
import {
  parseCalendarGridStart,
  timerCalendarWallStart,
} from "../lib/wallClockTimeZone";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;

    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) return null;

    const elapsed = Math.max(
      0,
      Math.floor((Date.now() - timer.startTime) / 1000),
    );
    const { displayTitle, displayColor, secondaryColor } =
      await resolveActiveTimerCalendarDisplay(ctx, user._id, timer);
    return {
      ...timer,
      elapsedSeconds: elapsed,
      displayTitle,
      displayColor,
      secondaryColor,
    };
  },
});

export const startTaskTimer = mutation({
  args: {
    taskId: v.id("tasks"),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const existing = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existing) {
      await finalizeTimer(ctx, existing);
    }

    await ctx.db.insert("taskTimers", {
      userId: user._id,
      taskId: args.taskId,
      timeZone: args.timeZone,
      startTime: Date.now(),
    });
  },
});

export const startTrackableTimer = mutation({
  args: {
    trackableId: v.id("trackables"),
    timeZone: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const existing = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (existing) {
      await finalizeTimer(ctx, existing);
    }

    await ctx.db.insert("taskTimers", {
      userId: user._id,
      trackableId: args.trackableId,
      timeZone: args.timeZone,
      startTime: Date.now(),
    });
  },
});

export const stop = mutation({
  args: { clientTimeZone: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    let timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) throw new Error("No active timer");

    const tz = args.clientTimeZone?.trim();
    if (tz) {
      await ctx.db.patch(timer._id, { timeZone: tz });
      timer = { ...timer, timeZone: tz };
    }

    const elapsed = await finalizeTimer(ctx, timer);
    return { elapsedSeconds: elapsed };
  },
});

export const adjust = mutation({
  args: { startTimeEpochMs: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) throw new Error("No active timer");
    let start = args.startTimeEpochMs;
    if (!Number.isFinite(start)) throw new Error("Invalid start time");
    const now = Date.now();
    // Client clock can run ahead of the Convex host; never persist a future
    // start instant or `finalizeTimer` sees negative elapsed and skips the
    // time window (while optimistic UI may still bump task time).
    if (start > now) start = now;

    await ctx.db.patch(timer._id, { startTime: start });
  },
});

/**
 * One transaction for calendar top-edge resize: epoch start + grid anchor + browser
 * IANA zone. Avoids pausing between `adjust` and `setLiveTimerCalendarAnchor` with
 * no anchor but a local epoch — finalize would then use wallClock(epoch, timer.timeZone)
 * and a stale/wrong zone (e.g. UTC) shifts HH:MM by hours on the local calendar.
 */
export const resizeLiveTimer = mutation({
  args: {
    startTimeEpochMs: v.number(),
    calendarStartDayYYYYMMDD: v.string(),
    calendarStartTimeHHMM: v.string(),
    clientTimeZone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) throw new Error("No active timer");

    let start = args.startTimeEpochMs;
    if (!Number.isFinite(start)) throw new Error("Invalid start time");
    const now = Date.now();
    if (start > now) start = now;

    const parsed = parseCalendarGridStart(
      args.calendarStartDayYYYYMMDD,
      args.calendarStartTimeHHMM,
    );
    if (!parsed) throw new Error("Invalid calendar anchor");

    const tz = args.clientTimeZone?.trim();
    await ctx.db.patch(timer._id, {
      startTime: start,
      calendarStartDayYYYYMMDD: parsed.startDayYYYYMMDD,
      calendarStartTimeHHMM: parsed.startTimeHHMM,
      ...(tz ? { timeZone: tz } : {}),
    });
  },
});

/**
 * Refresh `taskTimers.timeZone` from the browser so `finalizeTimer` wall-clock
 * fallback matches the same zone used by `localDayStartMinutesToEpochMs`.
 */
export const syncTimerClientTimeZone = mutation({
  args: { clientTimeZone: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) return;
    const tz = args.clientTimeZone.trim();
    if (!tz) return;
    await ctx.db.patch(timer._id, { timeZone: tz });
  },
});

/**
 * Calendar grid anchor for the running timer (after `adjust`). Used when
 * `resizeLiveTimer` is unavailable; pair with `syncTimerClientTimeZone` after
 * `adjust` so wall-clock fallback uses the browser zone.
 */
export const setLiveTimerCalendarAnchor = mutation({
  args: {
    calendarStartDayYYYYMMDD: v.string(),
    calendarStartTimeHHMM: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) throw new Error("No active timer");
    const parsed = parseCalendarGridStart(
      args.calendarStartDayYYYYMMDD,
      args.calendarStartTimeHHMM,
    );
    if (!parsed) throw new Error("Invalid calendar anchor");
    await ctx.db.patch(timer._id, {
      calendarStartDayYYYYMMDD: parsed.startDayYYYYMMDD,
      calendarStartTimeHHMM: parsed.startTimeHHMM,
    });
  },
});

async function finalizeTimer(
  ctx: any,
  timer: any
): Promise<number> {
  const elapsed = Math.max(
    0,
    Math.floor((Date.now() - timer.startTime) / 1000),
  );
  if (elapsed > 0) {
    const { startDayYYYYMMDD: day, startTimeHHMM } = timerCalendarWallStart(
      timer.calendarStartDayYYYYMMDD,
      timer.calendarStartTimeHHMM,
      timer.startTime,
      timer.timeZone,
    );

    // Snapshot the resolved trackableId onto the window so reassigning the
    // task later does not retroactively move historical time. Mirrors
    // productivity-one's `task.store.timer.facade.ts:startTaskTimer`.
    let snapshotTrackableId: any = timer.trackableId;
    if (timer.taskId && !snapshotTrackableId) {
      const task = await ctx.db.get(timer.taskId);
      const links = await ctx.db
        .query("listTrackableLinks")
        .withIndex("by_user", (q: any) => q.eq("userId", timer.userId))
        .collect();
      const listIdToTrackableId = buildListIdToTrackableId(links);
      snapshotTrackableId = resolveSnapshotTrackableIdForTask({
        task: task
          ? { trackableId: task.trackableId, listId: task.listId }
          : null,
        listIdToTrackableId,
      });
    }

    await ctx.db.insert("timeWindows", {
      startTimeHHMM,
      startDayYYYYMMDD: day,
      durationSeconds: elapsed,
      userId: timer.userId,
      budgetType: "ACTUAL" as const,
      activityType: timer.taskId ? ("TASK" as const) : ("TRACKABLE" as const),
      taskId: timer.taskId,
      trackableId: snapshotTrackableId,
      timeZone: timer.timeZone,
      isRecurringInstance: false,
      source: "timer" as const,
    });

    if (timer.taskId) {
      const task = await ctx.db.get(timer.taskId);
      if (task) {
        await ctx.db.patch(timer.taskId, {
          timeSpentInSecondsUnallocated:
            (task.timeSpentInSecondsUnallocated ?? 0) + elapsed,
        });
      }
    }
  }

  await ctx.db.delete(timer._id);
  return elapsed;
}
