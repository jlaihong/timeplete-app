/** Quick lookup for a single trackable's contributing windows. */
import { internalQuery } from "../_generated/server";
import { v } from "convex/values";

export const windowsForTrackable = internalQuery({
  args: { trackableId: v.id("trackables") },
  handler: async (ctx, args) => {
    const trackable = await ctx.db.get(args.trackableId);
    if (!trackable) return null;

    const snapshotWindows = await ctx.db
      .query("timeWindows")
      .withIndex("by_trackable", (q) => q.eq("trackableId", args.trackableId))
      .collect();

    const rows = [];
    for (const w of snapshotWindows) {
      let taskName: string | undefined;
      let taskTrackableId: string | undefined;
      let taskListId: string | undefined;
      if (w.taskId) {
        const task = await ctx.db.get(w.taskId);
        if (task) {
          taskName = task.name;
          taskTrackableId = task.trackableId;
          taskListId = task.listId;
        }
      }
      rows.push({
        windowId: w._id,
        durationSeconds: w.durationSeconds,
        budgetType: w.budgetType,
        activityType: w.activityType,
        taskId: w.taskId,
        taskName,
        taskTrackableId,
        taskListId,
        startDayYYYYMMDD: w.startDayYYYYMMDD,
        source: w.source,
      });
    }

    return {
      trackable: {
        id: trackable._id,
        name: trackable.name,
        lifetimeTotalSeconds: trackable.lifetimeTotalSeconds ?? 0,
      },
      windows: rows,
    };
  },
});
