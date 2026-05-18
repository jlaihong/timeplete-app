import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  buildTaskInfoMap,
  resolveAttributedTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import { enrichTimeWindowsWithDisplayFields } from "./_helpers/timeWindowDisplayEnrichment";
import { wallClockGridToEpochMs } from "./_helpers/wallClockTimeZone";
import {
  onTimeWindowDeleted,
  onTimeWindowInserted,
  onTimeWindowPatched,
} from "./_helpers/taskTimeSpent";
import {
  onAttributedWindowDeleted,
  onAttributedWindowInserted,
  onAttributedWindowPatched,
} from "./_helpers/trackableLifetime";

function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

function computeStartEpochMsForWindow(
  day: string,
  hhmm: string,
  timeZone: string,
): number | undefined {
  const tz =
    typeof timeZone === "string" && timeZone.trim() !== ""
      ? timeZone.trim()
      : "UTC";
  try {
    return wallClockGridToEpochMs(day, minutesFromHHMM(hhmm), tz);
  } catch {
    return undefined;
  }
}

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
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

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
    const directListIds = new Set<string>();
    for (const w of filtered) {
      if (w.activityType === "TASK" && w.taskId) taskIds.add(w.taskId);
      // Calendar color logic should honor direct trackable links regardless
      // of activityType (EVENT/TRACKABLE/TASK snapshot).
      if (w.trackableId)
        trackableIds.add(w.trackableId);
      // Direct list links can appear on any non-TASK row (TASK rows
      // derive their list from `task.listId` instead).
      if (w.listId) directListIds.add(w.listId);
      // EVENT activity type without a list link falls through to
      // DEFAULT_EVENT_COLOR.
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
    const listIds = new Set<string>(directListIds);
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
        { trackableId: w.trackableId, taskId: w.taskId, listId: w.listId },
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

    return enrichTimeWindowsWithDisplayFields(
      filtered,
      tasksById,
      listsById,
      trackablesById,
      links
    );
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
    listId: v.optional(v.id("lists")),
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
    /** Restore after delete (`insert` branch only — see handler). */
    recurringEventId: v.optional(v.id("recurringEvents")),
    /** Restore after delete (`insert` branch only — defaults to `false`). */
    isRecurringInstance: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    // Coerce empty/whitespace title to undefined. The display layer
    // (`search` below) treats `undefined` as "no explicit title — derive
    // from linked entity". Storing `""` would otherwise look like an
    // explicit (empty) title and break dynamic name updates.
    const normalizedTitle =
      typeof args.title === "string" && args.title.trim().length > 0
        ? args.title.trim()
        : undefined;

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

    const startTimeEpochMs = computeStartEpochMsForWindow(
      args.startDayYYYYMMDD,
      args.startTimeHHMM,
      args.timeZone,
    );

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Time window not found");
      await ctx.db.patch(args.id, {
        startTimeHHMM: args.startTimeHHMM,
        startDayYYYYMMDD: args.startDayYYYYMMDD,
        startTimeEpochMs,
        durationSeconds: args.durationSeconds,
        budgetType: args.budgetType,
        activityType: args.activityType,
        taskId: args.taskId,
        trackableId: resolvedTrackableId,
        listId: args.listId,
        title: normalizedTitle,
        comments: args.comments,
        tagIds: args.tagIds,
        timeZone: args.timeZone,
        source: args.source ?? existing.source,
      });
      // Keep `task.timeSpentInSecondsUnallocated` in lock-step so the
      // home/list readers can serve totals from the row directly
      // without re-aggregating windows on every fetch (fix #4).
      await onTimeWindowPatched(
        ctx,
        {
          taskId: existing.taskId,
          activityType: existing.activityType,
          budgetType: existing.budgetType,
          durationSeconds: existing.durationSeconds,
        },
        {
          taskId: args.taskId,
          activityType: args.activityType,
          budgetType: args.budgetType,
          durationSeconds: args.durationSeconds,
        },
      );
      // And keep the trackable lifetime totals aligned so
      // `getGoalDetails` can serve all-time numbers off the row (fix #1).
      await onAttributedWindowPatched(
        ctx,
        {
          trackableId: existing.trackableId,
          budgetType: existing.budgetType,
          durationSeconds: existing.durationSeconds,
          startDayYYYYMMDD: existing.startDayYYYYMMDD,
        },
        {
          trackableId: resolvedTrackableId,
          budgetType: args.budgetType,
          durationSeconds: args.durationSeconds,
          startDayYYYYMMDD: args.startDayYYYYMMDD,
        },
      );
      return args.id;
    }

    const insertedId = await ctx.db.insert("timeWindows", {
      startTimeHHMM: args.startTimeHHMM,
      startDayYYYYMMDD: args.startDayYYYYMMDD,
      startTimeEpochMs,
      durationSeconds: args.durationSeconds,
      userId: user._id,
      budgetType: args.budgetType,
      activityType: args.activityType,
      taskId: args.taskId,
      trackableId: resolvedTrackableId,
      listId: args.listId,
      title: normalizedTitle,
      comments: args.comments,
      tagIds: args.tagIds,
      timeZone: args.timeZone,
      recurringEventId: args.recurringEventId,
      isRecurringInstance: args.isRecurringInstance ?? false,
      source: args.source,
    });
    await onTimeWindowInserted(ctx, {
      taskId: args.taskId,
      activityType: args.activityType,
      budgetType: args.budgetType,
      durationSeconds: args.durationSeconds,
    });
    if (resolvedTrackableId && args.budgetType === "ACTUAL") {
      await onAttributedWindowInserted(ctx, {
        trackableId: resolvedTrackableId,
        durationSeconds: args.durationSeconds,
        startDayYYYYMMDD: args.startDayYYYYMMDD,
      });
    }
    return insertedId;
  },
});

export const remove = mutation({
  args: { id: v.id("timeWindows") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tw = await ctx.db.get(args.id);
    if (!tw) throw new Error("Time window not found");
    await ctx.db.delete(args.id);
    await onTimeWindowDeleted(ctx, {
      taskId: tw.taskId,
      activityType: tw.activityType,
      budgetType: tw.budgetType,
      durationSeconds: tw.durationSeconds,
    });
    await onAttributedWindowDeleted(ctx, {
      trackableId: tw.trackableId,
      budgetType: tw.budgetType,
      durationSeconds: tw.durationSeconds,
    });
  },
});
