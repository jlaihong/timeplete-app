import { query, mutation } from "./_generated/server";
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

async function finalizeTimer(ctx: any, timer: any): Promise<number> {
  const now = Date.now();
  const effectiveStart = Math.min(timer.startTime, now);
  const elapsed = Math.max(0, Math.floor((now - effectiveStart) / 1000));

  const tz =
    typeof timer.timeZone === "string" && timer.timeZone.trim() !== ""
      ? timer.timeZone.trim()
      : "UTC";

  const wall = wallClockInTimeZone(timer.startTime, tz);
  console.log(
    JSON.stringify({
      tag: "timers.finalizeTimer",
      timerId: timer._id,
      startTimeEpochMs: timer.startTime,
      startTimeIso: new Date(timer.startTime).toISOString(),
      serverNowEpochMs: now,
      serverNowIso: new Date(now).toISOString(),
      timeZoneIANA: tz,
      derivedStartDayYYYYMMDD: wall.startDayYYYYMMDD,
      derivedStartTimeHHMM: wall.startTimeHHMM,
      elapsedSeconds: elapsed,
    }),
  );

  if (elapsed > 0) {
    const { startDayYYYYMMDD: day, startTimeHHMM } = wall;

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

    const twId = await ctx.db.insert("timeWindows", {
      startTimeHHMM,
      startDayYYYYMMDD: day,
      startTimeEpochMs: timer.startTime,
      durationSeconds: elapsed,
      userId: timer.userId,
      budgetType: "ACTUAL" as const,
      activityType: timer.taskId ? ("TASK" as const) : ("TRACKABLE" as const),
      taskId: timer.taskId,
      trackableId: snapshotTrackableId,
      timeZone: tz,
      isRecurringInstance: false,
      source: "timer" as const,
    });

    // Keep `task.timeSpentInSecondsUnallocated` aligned with the row
    // we just inserted so the home/list views can serve the total
    // straight off the task document (no per-task `timeWindows` scan).
    await onTimeWindowInserted(ctx, {
      taskId: timer.taskId ?? undefined,
      activityType: timer.taskId ? ("TASK" as const) : ("TRACKABLE" as const),
      budgetType: "ACTUAL" as const,
      durationSeconds: elapsed,
    });
    // Mirror the lifetime totals on the trackable so `getGoalDetails`
    // can serve all-time numbers off the row (fix #1).
    if (snapshotTrackableId) {
      await onAttributedWindowInserted(ctx, {
        trackableId: snapshotTrackableId,
        durationSeconds: elapsed,
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

  await ctx.db.delete(timer._id);
  return elapsed;
}
