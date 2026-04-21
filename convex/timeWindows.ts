import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";

export const search = query({
  args: {
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    budgetType: v.optional(v.string()),
    activityType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    let windows;
    if (args.taskId) {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_task", (q) => q.eq("taskId", args.taskId!))
        .collect();
    } else if (args.trackableId) {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_trackable", (q) =>
          q.eq("trackableId", args.trackableId!)
        )
        .collect();
    } else {
      windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    }

    const filtered = windows.filter((w) => {
      if (args.startDay && w.startDayYYYYMMDD < args.startDay) return false;
      if (args.endDay && w.startDayYYYYMMDD > args.endDay) return false;
      if (args.budgetType && w.budgetType !== args.budgetType) return false;
      if (args.activityType && w.activityType !== args.activityType) return false;
      return true;
    });

    // Enrich display title from the linked task / trackable so the calendar
    // shows the current name (matches productivity-one, where the interactive
    // calendar event factory reads task.name / trackable.name at render time
    // rather than duplicating it into the time window). Also fixes migration
    // rows written without a `title` — without this they would render as
    // "TASK" / "TRACKABLE" (the activity type literal).
    //
    // Batched via `Promise.all` + a per-window id collection so we only
    // issue one get per unique task/trackable even when the same is
    // scheduled multiple times in the range.
    const taskIds = new Set<string>();
    const trackableIds = new Set<string>();
    for (const w of filtered) {
      if (w.activityType === "TASK" && w.taskId) taskIds.add(w.taskId);
      if (w.activityType === "TRACKABLE" && w.trackableId)
        trackableIds.add(w.trackableId);
    }

    const [taskEntries, trackableEntries] = await Promise.all([
      Promise.all(
        Array.from(taskIds).map(async (id) => {
          const t = await ctx.db.get(id as Id<"tasks">);
          return [id, t?.name ?? null] as const;
        })
      ),
      Promise.all(
        Array.from(trackableIds).map(async (id) => {
          const t = await ctx.db.get(id as Id<"trackables">);
          return [id, t?.name ?? null] as const;
        })
      ),
    ]);
    const taskNames = new Map(taskEntries);
    const trackableNames = new Map(trackableEntries);

    return filtered.map((w) => {
      let displayTitle = w.title ?? undefined;
      if (w.activityType === "TASK" && w.taskId) {
        // Always prefer the live task name so renames propagate. Fall back
        // to the persisted title if the task has been deleted.
        displayTitle = taskNames.get(w.taskId) ?? displayTitle;
      } else if (w.activityType === "TRACKABLE" && w.trackableId) {
        displayTitle = trackableNames.get(w.trackableId) ?? displayTitle;
      }
      return { ...w, title: displayTitle };
    });
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("timeWindows")),
    startTimeHHMM: v.string(),
    startDayYYYYMMDD: v.string(),
    durationSeconds: v.number(),
    budgetType: v.union(v.literal("ACTUAL"), v.literal("BUDGETED")),
    activityType: v.union(
      v.literal("TASK"),
      v.literal("EVENT"),
      v.literal("TRACKABLE")
    ),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    title: v.optional(v.string()),
    comments: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.string(),
    source: v.optional(
      v.union(
        v.literal("timer"),
        v.literal("manual"),
        v.literal("calendar"),
        v.literal("tracker_entry")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    // Auto-snapshot the resolved trackableId when a task window is created
    // without one (e.g. CalendarView drag-drop). This keeps trackable totals
    // in sync without requiring every call site to resolve the link itself.
    let resolvedTrackableId = args.trackableId;
    if (!resolvedTrackableId && args.taskId) {
      const task = await ctx.db.get(args.taskId);
      const links = await ctx.db
        .query("listTrackableLinks")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const listIdToTrackableId = buildListIdToTrackableId(links);
      resolvedTrackableId = resolveSnapshotTrackableIdForTask({
        task: task
          ? { trackableId: task.trackableId, listId: task.listId }
          : null,
        listIdToTrackableId,
      });
    }

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Time window not found");
      await ctx.db.patch(args.id, {
        startTimeHHMM: args.startTimeHHMM,
        startDayYYYYMMDD: args.startDayYYYYMMDD,
        durationSeconds: args.durationSeconds,
        budgetType: args.budgetType,
        activityType: args.activityType,
        taskId: args.taskId,
        trackableId: resolvedTrackableId,
        title: args.title,
        comments: args.comments,
        tagIds: args.tagIds,
        timeZone: args.timeZone,
        source: args.source ?? existing.source,
      });
      return args.id;
    }

    return await ctx.db.insert("timeWindows", {
      startTimeHHMM: args.startTimeHHMM,
      startDayYYYYMMDD: args.startDayYYYYMMDD,
      durationSeconds: args.durationSeconds,
      userId: user._id,
      budgetType: args.budgetType,
      activityType: args.activityType,
      taskId: args.taskId,
      trackableId: resolvedTrackableId,
      title: args.title,
      comments: args.comments,
      tagIds: args.tagIds,
      timeZone: args.timeZone,
      isRecurringInstance: false,
      source: args.source,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("timeWindows") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tw = await ctx.db.get(args.id);
    if (!tw) throw new Error("Time window not found");
    await ctx.db.delete(args.id);
  },
});
