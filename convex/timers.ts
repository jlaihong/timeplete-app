import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) return null;

    const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
    return {
      ...timer,
      elapsedSeconds: elapsed,
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

export const adjust = mutation({
  args: { startTimeEpochMs: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const timer = await ctx.db
      .query("taskTimers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();

    if (!timer) throw new Error("No active timer");
    await ctx.db.patch(timer._id, { startTime: args.startTimeEpochMs });
  },
});

async function finalizeTimer(
  ctx: any,
  timer: any
): Promise<number> {
  const elapsed = Math.floor((Date.now() - timer.startTime) / 1000);
  if (elapsed > 0) {
    const now = new Date();
    const day = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const hours = String(now.getHours()).padStart(2, "0");
    const mins = String(now.getMinutes()).padStart(2, "0");

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
      startTimeHHMM: `${hours}:${mins}`,
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
