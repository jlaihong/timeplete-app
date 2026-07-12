import { query, mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import { resolveActiveTimerCalendarDisplay } from "./_helpers/activeTimerCalendarDisplay";
import { wallClockInTimeZone } from "./_helpers/wallClockTimeZone";
import { onTimeWindowInserted } from "./_helpers/taskTimeSpent";
import { onAttributedWindowInserted } from "./_helpers/trackableLifetime";

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

    // `elapsedSeconds` is intentionally NOT computed here — calling Date.now()
    // inside a query handler is non-deterministic and forces re-execution as
    // wall-clock advances, busting the Convex result cache. The client owns
    // the ticking display (see `hooks/useTimer.ts`), seeded from `startTime`.
    const { displayTitle, displayColor, secondaryColor } =
      await resolveActiveTimerCalendarDisplay(ctx, user._id, timer);
    return {
      ...timer,
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
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) throw new Error("No active timer");

    const elapsed = await finalizeTimer(ctx, timer);
    return { elapsedSeconds: elapsed };
  },
});

/**
 * Move the running timer start instant (`startTime` UTC epoch ms).
 * Client must send an epoch produced by `wallClockGridToEpochMs(day, minutes, timer.timeZone)`
 * so grid gestures and server finalization share one IANA zone + one instant.
 */
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
    if (start > now) start = now;

    await ctx.db.patch(timer._id, {
      startTime: start,
      // Elapsed time changed, so confirmed check-in checkpoints no longer
      // line up — recalibrate against the new start. Clearing notifiedUpToMs
      // also re-arms reminders; devices observing the new startTime cancel
      // and reschedule their local notifications, then re-claim delivery.
      acknowledgedUpToMs: undefined,
      notifiedUpToMs: undefined,
      calendarStartDayYYYYMMDD: undefined,
      calendarStartTimeHHMM: undefined,
    });

    const stored = await ctx.db.get(timer._id);
    console.log(
      JSON.stringify({
        tag: "timers.adjust.storedTaskTimer",
        timerId: timer._id,
        startTimeEpochMs: stored?.startTime,
        timeZoneIANA: stored?.timeZone,
        calendarStartDayYYYYMMDD: stored?.calendarStartDayYYYYMMDD,
        calendarStartTimeHHMM: stored?.calendarStartTimeHHMM,
      }),
    );
  },
});

/** Elapsed-time cap: timers running this long are auto-stopped for review. */
export const TIMER_AUTO_STOP_MS = 24 * 60 * 60 * 1000;

/**
 * Insert the ACTUAL time window (+ derived counters) for a finished timer
 * period. Shared by normal stop (`finalizeTimer`, duration = now − start),
 * the check-in "No" flow (`stopWithDuration`, user-edited start/duration)
 * and the 24h auto-stop review (`resolvePendingReview`).
 */
async function insertTimerWindow(
  ctx: any,
  source: {
    userId: any;
    taskId?: any;
    trackableId?: any;
    timeZone?: string;
    startTime: number;
  },
  durationSeconds: number,
): Promise<void> {
  if (durationSeconds <= 0) return;

  const tz =
    typeof source.timeZone === "string" && source.timeZone.trim() !== ""
      ? source.timeZone.trim()
      : "UTC";
  const wall = wallClockInTimeZone(source.startTime, tz);
  const { startDayYYYYMMDD: day, startTimeHHMM } = wall;

  let snapshotTrackableId: any = source.trackableId;
  if (source.taskId && !snapshotTrackableId) {
    const task = await ctx.db.get(source.taskId);
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q: any) => q.eq("userId", source.userId))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(links);
    snapshotTrackableId = resolveSnapshotTrackableIdForTask({
      task: task
        ? { trackableId: task.trackableId, listId: task.listId }
        : null,
      listIdToTrackableId,
    });
  }

  const twId = await ctx.db.insert("timeWindows", {
    startTimeHHMM,
    startDayYYYYMMDD: day,
    startTimeEpochMs: source.startTime,
    durationSeconds,
    userId: source.userId,
    budgetType: "ACTUAL" as const,
    activityType: source.taskId ? ("TASK" as const) : ("TRACKABLE" as const),
    taskId: source.taskId,
    trackableId: snapshotTrackableId,
    timeZone: tz,
    isRecurringInstance: false,
    source: "timer" as const,
  });

  // Keep `task.timeSpentInSecondsUnallocated` aligned with the row
  // we just inserted so the home/list views can serve the total
  // straight off the task document (no per-task `timeWindows` scan).
  await onTimeWindowInserted(ctx, {
    taskId: source.taskId ?? undefined,
    activityType: source.taskId ? ("TASK" as const) : ("TRACKABLE" as const),
    budgetType: "ACTUAL" as const,
    durationSeconds,
  });
  // Mirror the lifetime totals on the trackable so `getGoalDetails`
  // can serve all-time numbers off the row (fix #1).
  if (snapshotTrackableId) {
    await onAttributedWindowInserted(ctx, {
      trackableId: snapshotTrackableId,
      durationSeconds,
      startDayYYYYMMDD: day,
    });
  }

  const inserted = await ctx.db.get(twId);
  console.log(
    JSON.stringify({
      tag: "timers.finalize.insertedTimeWindow",
      timeWindowId: twId,
      row: inserted,
    }),
  );
}

async function finalizeTimer(ctx: any, timer: any): Promise<number> {
  const now = Date.now();
  const effectiveStart = Math.min(timer.startTime, now);
  const elapsed = Math.max(0, Math.floor((now - effectiveStart) / 1000));

  console.log(
    JSON.stringify({
      tag: "timers.finalizeTimer",
      timerId: timer._id,
      startTimeEpochMs: timer.startTime,
      serverNowEpochMs: now,
      elapsedSeconds: elapsed,
    }),
  );

  await insertTimerWindow(ctx, timer, elapsed);
  await ctx.db.delete(timer._id);
  return elapsed;
}

/**
 * Check-in "Yes, still working": remember the confirmed checkpoint so the
 * popup doesn't re-appear until the NEXT 2h boundary is crossed.
 */
export const acknowledgeCheckpoint = mutation({
  args: { checkpointMs: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) return null;

    const elapsed = Math.max(0, Date.now() - timer.startTime);
    const next = Math.max(
      timer.acknowledgedUpToMs ?? 0,
      Math.min(Math.max(0, args.checkpointMs), elapsed),
    );
    await ctx.db.patch(timer._id, { acknowledgedUpToMs: next });
    return null;
  },
});

/**
 * A native device scheduled LOCAL notifications for every remaining
 * check-in boundary of the running timer (plus the 24h auto-stop one),
 * so remote pushes for this run would be duplicates. Marks the timer
 * fully notified; `timers.adjust` clears the flag when boundaries move.
 */
export const claimLocalNotificationDelivery = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) return null;
    if ((timer.notifiedUpToMs ?? 0) < TIMER_AUTO_STOP_MS) {
      await ctx.db.patch(timer._id, { notifiedUpToMs: TIMER_AUTO_STOP_MS });
    }
    return null;
  },
});

/**
 * Check-in "No, I stopped earlier": stop the running timer and log the
 * period the user actually worked — an edited start instant plus an
 * explicit duration — instead of start → now.
 */
export const stopWithDuration = mutation({
  args: {
    startTimeEpochMs: v.number(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!timer) throw new Error("No active timer");

    const now = Date.now();
    let start = args.startTimeEpochMs;
    if (!Number.isFinite(start)) throw new Error("Invalid start time");
    if (start > now) start = now;
    const duration = Math.max(
      0,
      Math.min(
        Math.floor(args.durationSeconds),
        Math.floor(TIMER_AUTO_STOP_MS / 1000),
      ),
    );

    await insertTimerWindow(ctx, { ...timer, startTime: start }, duration);
    await ctx.db.delete(timer._id);
    return { loggedSeconds: duration };
  },
});

/** Oldest unresolved 24h auto-stop held for the user's review, if any. */
export const getPendingReview = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    return await ctx.db
      .query("pendingTimerReviews")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
  },
});

/**
 * Resolve a 24h auto-stop: log the user-confirmed period (duration 0 =
 * log nothing / discard) and clear the pending row.
 */
export const resolvePendingReview = mutation({
  args: {
    pendingId: v.id("pendingTimerReviews"),
    startTimeEpochMs: v.number(),
    durationSeconds: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const pending = await ctx.db.get(args.pendingId);
    if (!pending || pending.userId !== user._id) {
      throw new Error("Pending review not found");
    }

    let start = args.startTimeEpochMs;
    if (!Number.isFinite(start)) throw new Error("Invalid start time");
    if (start > pending.stoppedAtMs) start = pending.stoppedAtMs;
    const duration = Math.max(
      0,
      Math.min(
        Math.floor(args.durationSeconds),
        Math.floor(TIMER_AUTO_STOP_MS / 1000),
      ),
    );

    await insertTimerWindow(
      ctx,
      {
        userId: pending.userId,
        taskId: pending.taskId,
        trackableId: pending.trackableId,
        timeZone: pending.timeZone,
        startTime: start,
      },
      duration,
    );
    await ctx.db.delete(pending._id);
    return { loggedSeconds: duration };
  },
});

/**
 * Cron target: stop timers that have been running for 24h+ WITHOUT
 * logging anything — park them in `pendingTimerReviews` so the owner
 * decides what to log next time they open the app.
 *
 * Scans the whole table: at most one row per user with a live timer,
 * so this stays tiny.
 */
export const autoStopLongTimers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const timers = await ctx.db.query("taskTimers").collect();
    for (const timer of timers) {
      if (now - timer.startTime < TIMER_AUTO_STOP_MS) continue;

      const { displayTitle } = await resolveActiveTimerCalendarDisplay(
        ctx,
        timer.userId,
        timer,
      );
      await ctx.db.insert("pendingTimerReviews", {
        userId: timer.userId,
        taskId: timer.taskId,
        trackableId: timer.trackableId,
        timeZone: timer.timeZone,
        startTime: timer.startTime,
        stoppedAtMs: now,
        displayTitle: displayTitle ?? undefined,
        acknowledgedUpToMs: timer.acknowledgedUpToMs,
      });
      await ctx.db.delete(timer._id);
      await ctx.scheduler.runAfter(
        0,
        internal.timerNotifications.sendAutoStopNotification,
        {
          userId: timer.userId,
          displayTitle: displayTitle ?? "Timer",
        },
      );
      console.log(
        JSON.stringify({
          tag: "timers.autoStopLongTimers.stopped",
          timerId: timer._id,
          userId: timer.userId,
          startTimeEpochMs: timer.startTime,
          elapsedMs: now - timer.startTime,
        }),
      );
    }
    return null;
  },
});
