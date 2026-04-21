import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  buildTaskInfoMap,
  resolveAttributedTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import { deriveEventColors } from "./_helpers/eventColors";

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

    // Enrich display title + colours from the linked task / trackable / list
    // so the calendar matches productivity-one without the client needing
    // to load every list and trackable separately.
    //
    // Source-of-truth mapping (`interactive-calendar-event-factory.service.ts:73-155`):
    //
    //   • Background (`displayColor`) = trackable.colour ?? list.colour ?? default
    //   • Left stripe (`secondaryColor`) = list.colour, only when BOTH a
    //     trackable colour AND a list colour exist and they differ
    //   • Title = task.name / trackable.name / persisted title fallback
    //
    // The Convex query is the right home for this because:
    //   1. CalendarView already subscribes to it on every reactive change,
    //      so colour updates flow through the existing subscription with no
    //      extra round-trips.
    //   2. Server-side enrichment avoids loading ALL lists/trackables on
    //      the client just to look up a per-event colour.
    //   3. It guarantees the server-stored display colour (used by the
    //      drag preview during creation) cannot drift from what the
    //      saved event later renders.
    //
    // Batched via `Promise.all` + per-window id sets so each unique task /
    // trackable / list is fetched at most once even when the same entity
    // is scheduled many times in the range.
    const taskIds = new Set<string>();
    const trackableIds = new Set<string>();
    for (const w of filtered) {
      if (w.activityType === "TASK" && w.taskId) taskIds.add(w.taskId);
      if (w.activityType === "TRACKABLE" && w.trackableId)
        trackableIds.add(w.trackableId);
      // EVENT activity type carries no task/trackable, so it always
      // falls through to DEFAULT_EVENT_COLOR.
    }

    const [taskDocs, trackableDocsFromWindows, links] = await Promise.all([
      Promise.all(
        Array.from(taskIds).map((id) => ctx.db.get(id as Id<"tasks">))
      ),
      Promise.all(
        Array.from(trackableIds).map((id) =>
          ctx.db.get(id as Id<"trackables">)
        )
      ),
      // listTrackableLinks is needed so a task with no direct trackable
      // but with a list that's linked to a trackable still inherits the
      // trackable colour (matches `resolveAttributedTrackableId`).
      ctx.db
        .query("listTrackableLinks")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect(),
    ]);

    const tasksById = new Map<string, NonNullable<typeof taskDocs[number]>>();
    const listIds = new Set<string>();
    for (const t of taskDocs) {
      if (!t) continue;
      tasksById.set(t._id, t);
      if (t.listId) listIds.add(t.listId);
    }

    const listDocs = await Promise.all(
      Array.from(listIds).map((id) => ctx.db.get(id as Id<"lists">))
    );
    const listsById = new Map<string, NonNullable<typeof listDocs[number]>>();
    for (const l of listDocs) {
      if (l) listsById.set(l._id, l);
    }

    // Resolve trackables: anything referenced directly on a window PLUS
    // anything attributable to a window via task → list → trackable so the
    // colour rule sees the same trackable the analytics aggregation does.
    const listIdToTrackableId = buildListIdToTrackableId(links);
    const taskInfoMap = buildTaskInfoMap(
      Array.from(tasksById.values())
    );

    const allTrackableIds = new Set<string>(trackableIds);
    for (const w of filtered) {
      if (w.activityType !== "TASK") continue;
      const resolved = resolveAttributedTrackableId(
        { trackableId: w.trackableId, taskId: w.taskId },
        taskInfoMap,
        listIdToTrackableId
      );
      if (resolved) allTrackableIds.add(resolved);
    }

    const trackableDocs = await Promise.all(
      // Some trackables may have been already fetched in
      // `trackableDocsFromWindows`, but Convex caches gets within a single
      // handler so re-issuing them is cheap and keeps the code simple.
      Array.from(allTrackableIds).map((id) =>
        ctx.db.get(id as Id<"trackables">)
      )
    );
    const trackablesById = new Map<
      string,
      NonNullable<typeof trackableDocs[number]>
    >();
    for (const t of trackableDocs) {
      if (t) trackablesById.set(t._id, t);
    }
    // Also fold in the windows-pass results so we don't lose entities
    // that didn't make the resolved-set (defensive: should be a no-op).
    for (const t of trackableDocsFromWindows) {
      if (t) trackablesById.set(t._id, t);
    }

    return filtered.map((w) => {
      let displayTitle = w.title ?? undefined;
      let trackableColour: string | undefined;
      let listColour: string | undefined;

      if (w.activityType === "EVENT") {
        // EVENT: no trackable / no list → default colour, persisted title.
        // (P1: title falls back to "Event" when missing — keep behaviour
        // here so the client renders a non-empty label even for legacy
        // rows.)
        if (!displayTitle) displayTitle = "Event";
      } else if (w.activityType === "TRACKABLE" && w.trackableId) {
        const trackable = trackablesById.get(w.trackableId);
        if (trackable?.name) displayTitle = trackable.name;
        trackableColour = trackable?.colour;
      } else if (w.activityType === "TASK") {
        const task = w.taskId ? tasksById.get(w.taskId) : undefined;
        if (task?.name) displayTitle = task.name;

        const resolvedTrackableId = resolveAttributedTrackableId(
          { trackableId: w.trackableId, taskId: w.taskId },
          taskInfoMap,
          listIdToTrackableId
        );
        trackableColour = resolvedTrackableId
          ? trackablesById.get(resolvedTrackableId)?.colour
          : undefined;
        listColour = task?.listId
          ? listsById.get(task.listId)?.colour
          : undefined;
      }

      const { displayColor, secondaryColor } = deriveEventColors(
        trackableColour,
        listColour
      );

      return {
        ...w,
        title: displayTitle,
        displayColor,
        secondaryColor,
      };
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
