import {
  query,
  mutation,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import { wallClockInTimeZone } from "./_helpers/wallClockTimeZone";
import {
  onTimeWindowDeleted,
  onTimeWindowInserted,
  onTimeWindowPatched,
} from "./_helpers/taskTimeSpent";
import {
  onAttributedWindowDeleted,
  onAttributedWindowInserted,
  onAttributedWindowPatched,
  onTaskCompletionAttribution,
} from "./_helpers/trackableLifetime";

/**
 * productivity-backend `upsert_task` sets `section_id` from `list_id` when the
 * client omits a section. Convex lists use a real `listSections` row, so we
 * resolve the list's default section instead.
 */
async function defaultSectionIdForList(
  ctx: MutationCtx,
  listId: Id<"lists">,
): Promise<Id<"listSections"> | undefined> {
  const sections = await ctx.db
    .query("listSections")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .collect();
  if (sections.length === 0) return undefined;
  const sorted = sections.sort((a, b) => a.orderIndex - b.orderIndex);
  const def = sorted.find((s) => s.isDefaultSection);
  return (def ?? sorted[0])?._id;
}

/** Same completion rule as `lists.getPaginated` (`compareTasksForListView`). */
function isTaskCompletedForListReorder(t: { dateCompleted?: string }): boolean {
  const d = t.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

/**
 * Must match `lists.getPaginated`: incomplete tasks first, then `sectionOrderIndex`.
 * Otherwise list DnD passes indices that do not match `moveBetweenSections` ordering.
 */
function compareTasksForListReorder(
  a: { dateCompleted?: string; sectionOrderIndex: number },
  b: { dateCompleted?: string; sectionOrderIndex: number },
): number {
  const aDone = isTaskCompletedForListReorder(a);
  const bDone = isTaskCompletedForListReorder(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  return a.sectionOrderIndex - b.sectionOrderIndex;
}

function windowEndEpochMs(w: Doc<"timeWindows">): number | null {
  const s = w.startTimeEpochMs;
  if (s == null || !Number.isFinite(s)) return null;
  return s + Math.max(0, w.durationSeconds ?? 0) * 1000;
}

/** Trim/delete ACTUAL TASK windows newest-by-(UTC end instant) first. */
function compareActualTaskWindowsNewestFirst(
  a: Doc<"timeWindows">,
  b: Doc<"timeWindows">,
): number {
  const endA = windowEndEpochMs(a);
  const endB = windowEndEpochMs(b);
  if (endA != null && endB != null) return endB - endA;
  if (endA != null) return -1;
  if (endB != null) return 1;
  const dayCmp = (b.startDayYYYYMMDD ?? "").localeCompare(
    a.startDayYYYYMMDD ?? "",
  );
  if (dayCmp !== 0) return dayCmp;
  const timeCmp = (b.startTimeHHMM ?? "").localeCompare(a.startTimeHHMM ?? "");
  if (timeCmp !== 0) return timeCmp;
  return (b._creationTime ?? 0) - (a._creationTime ?? 0);
}

function pickValidIANAZone(raw: string | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t }).format(0);
  } catch {
    return null;
  }
  return t;
}

async function inferIANAZoneForManualTaskSlice(
  ctx: MutationCtx,
  userId: Id<"users">,
  taskId: Id<"tasks">,
): Promise<string> {
  const taskRows = await ctx.db
    .query("timeWindows")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .collect();

  const forThisTask = taskRows.filter(
    (w) => w.activityType === "TASK" && w.budgetType === "ACTUAL",
  );
  forThisTask.sort(compareActualTaskWindowsNewestFirst);
  for (const w of forThisTask) {
    const z = pickValidIANAZone(w.timeZone);
    if (z) return z;
  }

  const timer = await ctx.db
    .query("taskTimers")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .first();
  const fromTimer = pickValidIANAZone(timer?.timeZone);
  if (fromTimer) return fromTimer;

  const userRecent = await ctx.db
    .query("timeWindows")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .order("desc")
    .take(120);

  for (const w of userRecent) {
    if (w.activityType !== "TASK" || w.budgetType !== "ACTUAL") continue;
    const z = pickValidIANAZone(w.timeZone);
    if (z) return z;
  }

  return "UTC";
}

export const search = query({
  args: {
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    trackableId: v.optional(v.id("trackables")),
    includeCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    let tasks;
    if (args.listId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_list", (q) => q.eq("listId", args.listId!))
        .collect();
    } else if (args.trackableId) {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_trackable", (q) =>
          q.eq("trackableId", args.trackableId!)
        )
        .collect();
    } else {
      tasks = await ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    }

    if (args.startDay || args.endDay) {
      tasks = tasks.filter((t) => {
        if (!t.taskDay) return false;
        if (args.startDay && t.taskDay < args.startDay) return false;
        if (args.endDay && t.taskDay > args.endDay) return false;
        return true;
      });
    }

    if (!args.includeCompleted) {
      tasks = tasks.filter((t) => !t.dateCompleted);
    }

    // Tag enrichment reads from the denormalized `tasks.tagIds` field
    // (see schema). The previous implementation scanned the entire
    // `taskTags` table on every list-view subscription, which was the
    // single largest contributor to read bandwidth for the lists screen.
    //
    // Legacy rows where the field has not been backfilled yet fall back
    // to a per-row `by_task` lookup so the view stays correct during the
    // migration window. After `_admin/backfillTaskTagIds:runAll` completes
    // the fallback path is dead code.
    const legacyRows = tasks.filter((t) => t.tagIds === undefined);
    const legacyMap = new Map<string, Id<"tags">[]>();
    if (legacyRows.length > 0) {
      await Promise.all(
        legacyRows.map(async (t) => {
          const tts = await ctx.db
            .query("taskTags")
            .withIndex("by_task", (q) => q.eq("taskId", t._id))
            .collect();
          if (tts.length > 0) {
            legacyMap.set(t._id, tts.map((tt) => tt.tagId));
          }
        }),
      );
    }

    return tasks
      .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex)
      .map((t) => ({
        ...t,
        tagIds: t.tagIds ?? legacyMap.get(t._id) ?? [],
      }));
  },
});

/**
 * Single-task subscription used by `TaskDetailSheet`.
 *
 * Replaces `api.tasks.search({ includeCompleted: true }).find(t._id === id)`
 * inside the detail sheet — that subscription was pulling every task the
 * user has ever created (incl. completed history) and re-firing on every
 * mutation. This query reads exactly two rows (the task + its tag rows)
 * and ignores changes to unrelated tasks, dramatically reducing both
 * payload size and reactive churn.
 *
 * Ownership is enforced server-side: returns `null` if the row belongs
 * to another user, mirroring the visibility rule in `tasks.search`.
 */
export const getById = query({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;

    const task = await ctx.db.get(args.id);
    if (!task || task.userId !== user._id) return null;

    const tts = await ctx.db
      .query("taskTags")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();

    return {
      ...task,
      tagIds: tts.map((tt) => tt.tagId),
    };
  },
});

/**
 * Returns the set of sibling task ids generated from the same recurring
 * rule. The detail sheet only needs to know *whether any future instance
 * exists*, which previously required iterating the full task list. We
 * scope to `by_recurring`, then project to `_id` + `taskDay` so the
 * payload stays tiny even for long series.
 *
 * Returns an empty array when `recurringTaskId` is null/undefined so the
 * caller can use the query unconditionally without `"skip"` plumbing.
 */
export const getRecurringSiblings = query({
  args: {
    recurringTaskId: v.union(v.id("recurringTasks"), v.null()),
  },
  handler: async (ctx, args) => {
    if (!args.recurringTaskId) return [];
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const siblings = await ctx.db
      .query("tasks")
      .withIndex("by_recurring", (q) =>
        q.eq("recurringTaskId", args.recurringTaskId ?? undefined),
      )
      .collect();

    return siblings
      .filter((t) => t.userId === user._id)
      .map((t) => ({
        _id: t._id,
        taskDay: t.taskDay,
        dateCompleted: t.dateCompleted,
      }));
  },
});

/**
 * Shared enrichment for home-task rows (`taskTags` + TASK ACTUAL windows).
 */
async function enrichHomeTasksPayload(
  ctx: QueryCtx,
  tasks: Doc<"tasks">[],
) {
  // Tags come from the denormalized `tasks.tagIds` field; legacy rows
  // missing the field fall back to a per-row `by_task` scan.
  //
  // The per-task `timeWindows` re-aggregation that previously lived
  // here has been removed (fix #4): `task.timeSpentInSecondsUnallocated`
  // is now authoritative, maintained on every TASK ACTUAL window write
  // by `_helpers/taskTimeSpent`. The previous implementation issued one
  // `by_task` scan per home task on every query invocation, which was
  // the second-largest source of home-page read bandwidth.
  const legacyTagRows = tasks.filter((t) => t.tagIds === undefined);
  const legacyTagMap = new Map<string, Id<"tags">[]>();
  if (legacyTagRows.length > 0) {
    await Promise.all(
      legacyTagRows.map(async (t) => {
        const tts = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        if (tts.length > 0) {
          legacyTagMap.set(
            t._id,
            tts.map((tt) => tt.tagId),
          );
        }
      }),
    );
  }

  return tasks
    .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex)
    .map((t) => ({
      ...t,
      timeSpentInSecondsUnallocated: t.timeSpentInSecondsUnallocated ?? 0,
      tagIds: t.tagIds ?? legacyTagMap.get(t._id) ?? [],
    }));
}

/**
 * Home-page task query.
 *
 * `todayYYYYMMDD` MUST be the user's clock **today** (local calendar day) —
 * the home UI merges older-day rows via existing `searchWithCriteria` so the
 * calendar does not shift this subscription anchor (productivity-one parity).
 *
 * Returns ONLY:
 *   1. Overdue tasks – incomplete, non-recurring, taskDay < today
 *   2. Tasks scheduled in [today, rangeEndYYYYMMDD]
 *      (plus any task completed in that range, so completions show up
 *       even if the task was originally scheduled earlier).
 *
 * The recurring-instance exclusion lives here on the server (not in the UI)
 * so the wire payload never contains recurring tasks for the Overdue group.
 *
 * "Load More" is server-driven: the client increments `rangeEndYYYYMMDD`
 * by 7 days and re-issues the query. Each call returns the *full current
 * window* (overdue + today..rangeEnd) – Convex re-uses cached results
 * for windows that haven't changed.
 */
export const getHomeTasks = query({
  args: {
    todayYYYYMMDD: v.string(),
    rangeEndYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const today = args.todayYYYYMMDD;
    const rangeEnd =
      args.rangeEndYYYYMMDD < today ? today : args.rangeEndYYYYMMDD;

    // 1. Tasks scheduled in [today, rangeEnd].
    const rangeTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).gte("taskDay", today).lte("taskDay", rangeEnd)
      )
      .collect();

    // 2. Overdue tasks: incomplete, scheduled before today, not a
    //    recurring instance.
    //
    //    Uses `by_user_recurring_completed_day` pinned to
    //    `isRecurringInstance=false` + `dateCompleted=undefined`, so the
    //    scan visits only open, NON-recurring past tasks. The previous
    //    index couldn't express the recurring exclusion, so it read every
    //    stale open recurring occurrence (172 of 179 scanned docs on real
    //    data) just to discard them in JS below. The `.gt("taskDay", "")`
    //    lower bound likewise excludes unscheduled rows (taskDay
    //    undefined) from the scan instead of filtering them in memory.
    const filteredOverdue = await ctx.db
      .query("tasks")
      .withIndex("by_user_recurring_completed_day", (q) =>
        q
          .eq("userId", user._id)
          .eq("isRecurringInstance", false)
          .eq("dateCompleted", undefined)
          .gt("taskDay", "")
          .lt("taskDay", today),
      )
      .collect();

    // 3. Tasks completed inside [today, rangeEnd] but originally scheduled
    //    before today – we want them to render in their completion-day
    //    bucket (matching productivity-one's grouping).
    //
    //    Uses the same index prefixed on `dateCompleted` so the scan
    //    walks only tasks whose completion timestamp falls in the
    //    visible window. This replaces an in-memory filter of every
    //    past task; the saving compounds as the user accumulates
    //    history.
    const completedInWindowRaw = await ctx.db
      .query("tasks")
      .withIndex("by_user_completed_day", (q) =>
        q
          .eq("userId", user._id)
          .gte("dateCompleted", today)
          .lte("dateCompleted", rangeEnd),
      )
      .collect();
    // Preserve the previous shape: only include tasks that were originally
    // scheduled before `today` (i.e. `taskDay !== undefined && taskDay < today`).
    // Tasks completed today that were also scheduled in-window are already
    // covered by `rangeTasks`.
    const completedInWindow = completedInWindowRaw.filter(
      (t) =>
        t.taskDay !== undefined &&
        (t.taskDay as string) < today,
    );

    // De-dupe by id – overdue, rangeTasks, and completedInWindow can
    // overlap once tasks shift between groups during the merge.
    const byId = new Map<string, (typeof rangeTasks)[number]>();
    for (const t of filteredOverdue) byId.set(t._id, t);
    for (const t of rangeTasks) byId.set(t._id, t);
    for (const t of completedInWindow) byId.set(t._id, t);
    const tasks = Array.from(byId.values());

    return enrichHomeTasksPayload(ctx, tasks);
  },
});

export const searchWithCriteria = query({
  args: {
    dayRanges: v.array(
      v.object({ startDay: v.string(), endDay: v.string() })
    ),
    includeCompleted: v.optional(v.boolean()),
    completedStartDay: v.optional(v.string()),
    completedEndDay: v.optional(v.string()),
    collaboratorIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    // Bounded read strategy: the previous implementation collected the
    // caller's ENTIRE task table (plus each collaborator's) and filtered
    // in JS — ~540 KB read per execution on real data, re-run on every
    // task write because the read set overlapped the whole table. The
    // requested day ranges and completed window are expressible directly
    // against `by_user_day` / `by_user_completed_day`, so read only those.
    const userIds = [
      user._id,
      ...(args.collaboratorIds ?? []).filter((id) => id !== user._id),
    ];

    const byId = new Map<string, Doc<"tasks">>();
    for (const uid of userIds) {
      for (const range of args.dayRanges) {
        const rows = await ctx.db
          .query("tasks")
          .withIndex("by_user_day", (q) =>
            q
              .eq("userId", uid)
              .gte("taskDay", range.startDay)
              .lte("taskDay", range.endDay),
          )
          .collect();
        for (const t of rows) byId.set(t._id, t);
      }

      if (args.includeCompleted && args.completedStartDay) {
        const completed = await ctx.db
          .query("tasks")
          .withIndex("by_user_completed_day", (q) =>
            q
              .eq("userId", uid)
              .gte("dateCompleted", args.completedStartDay!)
              .lte("dateCompleted", args.completedEndDay ?? "99999999"),
          )
          .collect();
        for (const t of completed) byId.set(t._id, t);
      }
    }

    return Array.from(byId.values()).sort(
      (a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex,
    );
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("tasks")),
    name: v.string(),
    parentId: v.optional(v.id("tasks")),
    // `undefined` (omitted) → leave unchanged; `null` → clear the field; string → set.
    dateCompleted: v.optional(v.union(v.string(), v.null())),
    timeSpentInSecondsUnallocated: v.optional(v.number()),
    timeEstimatedInSecondsUnallocated: v.optional(v.number()),
    dueDateYYYYMMDD: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    taskDay: v.optional(v.string()),
    taskDayOrderIndex: v.optional(v.number()),
    sectionId: v.optional(v.id("listSections")),
    sectionOrderIndex: v.optional(v.number()),
    // `undefined` (omitted) → leave unchanged; `null` → clear; id → set.
    trackableId: v.optional(v.union(v.id("trackables"), v.null())),
    tagIds: v.optional(v.array(v.id("tags"))),
    assignedToUserId: v.optional(v.id("users")),
    /**
     * Optional echo of `user._id` from the client — not persisted.
     * Lets optimistic stubs use the real viewer id (`createdBy` / assignee filters)
     * until the mutation ack returns.
     */
    clientViewerUserId: v.optional(v.id("users")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    if (
      args.clientViewerUserId !== undefined &&
      args.clientViewerUserId !== user._id
    ) {
      throw new Error("clientViewerUserId mismatch");
    }

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Task not found");

      // Snapshot the fields the attributed-task-day hook cares about so
      // we can compare to the post-patch state once everything has been
      // applied.
      const beforeAttribution = {
        userId: existing.userId,
        dateCompleted: existing.dateCompleted,
        trackableId: existing.trackableId,
        listId: existing.listId,
      };

      const patch: Record<string, unknown> = {};
      if (args.name !== undefined) patch.name = args.name;
      if (args.dateCompleted !== undefined) {
        // `null` → clear the field on the document; string → set it.
        patch.dateCompleted = args.dateCompleted ?? undefined;
      }
      if (args.timeSpentInSecondsUnallocated !== undefined)
        patch.timeSpentInSecondsUnallocated = args.timeSpentInSecondsUnallocated;
      if (args.timeEstimatedInSecondsUnallocated !== undefined)
        patch.timeEstimatedInSecondsUnallocated = args.timeEstimatedInSecondsUnallocated;
      if (args.dueDateYYYYMMDD !== undefined) patch.dueDateYYYYMMDD = args.dueDateYYYYMMDD;
      if (args.listId !== undefined) patch.listId = args.listId;
      if (args.taskDay !== undefined) patch.taskDay = args.taskDay;
      if (args.taskDayOrderIndex !== undefined) patch.taskDayOrderIndex = args.taskDayOrderIndex;
      if (args.sectionId !== undefined) patch.sectionId = args.sectionId;
      if (args.sectionOrderIndex !== undefined) patch.sectionOrderIndex = args.sectionOrderIndex;
      if (args.trackableId !== undefined) {
        patch.trackableId = args.trackableId ?? undefined;
      }
      if (args.assignedToUserId !== undefined) patch.assignedToUserId = args.assignedToUserId;
      // Keep denormalized `tagIds` on the task row in sync with the patch.
      // Readers like `tasks.search` / `lists.getPaginated` use this field
      // to avoid scanning the entire `taskTags` table.
      if (args.tagIds !== undefined) patch.tagIds = args.tagIds;

      await ctx.db.patch(args.id, patch as any);

      if (args.tagIds !== undefined) {
        const existing_tags = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", args.id!))
          .collect();
        for (const tt of existing_tags) {
          await ctx.db.delete(tt._id);
        }
        for (const tagId of args.tagIds) {
          await ctx.db.insert("taskTags", { taskId: args.id!, tagId });
        }
      }

      // Keep `trackable.lifetimeAttributedTaskDayCount` in sync if the
      // task's completion state or attribution-defining fields changed.
      // Helper is a no-op when neither before nor after counts.
      const completionChanged = args.dateCompleted !== undefined;
      const trackableChanged = args.trackableId !== undefined;
      const listChanged = args.listId !== undefined;
      if (completionChanged || trackableChanged || listChanged) {
        const afterAttribution = {
          userId: existing.userId,
          dateCompleted:
            args.dateCompleted !== undefined
              ? (args.dateCompleted ?? undefined)
              : existing.dateCompleted,
          trackableId:
            args.trackableId !== undefined
              ? (args.trackableId ?? undefined)
              : existing.trackableId,
          listId:
            args.listId !== undefined ? args.listId : existing.listId,
        };
        await onTaskCompletionAttribution(
          ctx,
          beforeAttribution,
          afterAttribution,
        );
      }

      return args.id;
    }

    let resolvedSectionId = args.sectionId;
    if (args.listId !== undefined && resolvedSectionId === undefined) {
      resolvedSectionId = await defaultSectionIdForList(ctx, args.listId);
    }

    const taskId = await ctx.db.insert("tasks", {
      name: args.name,
      parentId: args.parentId,
      dateCompleted: args.dateCompleted ?? undefined,
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated ?? 0,
      timeEstimatedInSecondsUnallocated: args.timeEstimatedInSecondsUnallocated ?? 0,
      dueDateYYYYMMDD: args.dueDateYYYYMMDD,
      listId: args.listId,
      taskDay: args.taskDay,
      taskDayOrderIndex: args.taskDayOrderIndex ?? 0,
      sectionId: resolvedSectionId,
      sectionOrderIndex: args.sectionOrderIndex ?? 0,
      trackableId: args.trackableId ?? undefined,
      isRecurringInstance: false,
      userId: user._id,
      createdBy: user._id,
      assignedToUserId: args.assignedToUserId,
      // Denormalized tag list — keeps list/home readers off the full
      // `taskTags` table scan. `taskTags` rows below are the secondary
      // index used by tag-centric queries (e.g. tag detail screens).
      tagIds: args.tagIds ?? undefined,
    });

    await ctx.db.patch(taskId, { rootTaskId: args.parentId ? undefined : taskId });

    if (args.tagIds) {
      for (const tagId of args.tagIds) {
        await ctx.db.insert("taskTags", { taskId, tagId });
      }
    }

    if (args.dateCompleted) {
      await onTaskCompletionAttribution(ctx, null, {
        userId: user._id,
        dateCompleted: args.dateCompleted,
        trackableId: args.trackableId ?? undefined,
        listId: args.listId,
      });
    }

    return taskId;
  },
});

export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.id);
    if (!task) throw new Error("Task not found");

    const children = await ctx.db
      .query("tasks")
      .withIndex("by_root", (q) => q.eq("rootTaskId", args.id))
      .collect();
    for (const child of children) {
      if (child._id !== args.id) {
        const tags = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", child._id))
          .collect();
        for (const tt of tags) await ctx.db.delete(tt._id);
        const childWindows = await ctx.db
          .query("timeWindows")
          .withIndex("by_task", (q) => q.eq("taskId", child._id))
          .collect();
        for (const w of childWindows) await ctx.db.delete(w._id);
        if (child.dateCompleted) {
          await onTaskCompletionAttribution(
            ctx,
            {
              userId: child.userId,
              dateCompleted: child.dateCompleted,
              trackableId: child.trackableId,
              listId: child.listId,
            },
            null,
          );
        }
        await ctx.db.delete(child._id);
      }
    }

    const tags = await ctx.db
      .query("taskTags")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const tt of tags) await ctx.db.delete(tt._id);

    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", args.id))
      .collect();
    for (const w of windows) await ctx.db.delete(w._id);

    if (task.dateCompleted) {
      await onTaskCompletionAttribution(
        ctx,
        {
          userId: task.userId,
          dateCompleted: task.dateCompleted,
          trackableId: task.trackableId,
          listId: task.listId,
        },
        null,
      );
    }

    await ctx.db.delete(args.id);
  },
});

export const moveOnDay = mutation({
  args: {
    taskId: v.id("tasks"),
    day: v.string(),
    newOrderIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    const dayTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).eq("taskDay", args.day)
      )
      .collect();

    const sorted = dayTasks.sort(
      (a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex
    );
    const without = sorted.filter((t) => t._id !== args.taskId);
    without.splice(args.newOrderIndex, 0, task);

    for (let i = 0; i < without.length; i++) {
      if (without[i].taskDayOrderIndex !== i) {
        await ctx.db.patch(without[i]._id, { taskDayOrderIndex: i });
      }
    }
  },
});

export const moveBetweenDays = mutation({
  args: {
    taskId: v.id("tasks"),
    fromDay: v.string(),
    toDay: v.string(),
    newOrderIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const fromTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).eq("taskDay", args.fromDay)
      )
      .collect();
    const fromSorted = fromTasks
      .filter((t) => t._id !== args.taskId)
      .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex);
    for (let i = 0; i < fromSorted.length; i++) {
      if (fromSorted[i].taskDayOrderIndex !== i) {
        await ctx.db.patch(fromSorted[i]._id, { taskDayOrderIndex: i });
      }
    }

    const toTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).eq("taskDay", args.toDay)
      )
      .collect();
    const toSorted = toTasks
      .filter((t) => t._id !== args.taskId)
      .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    toSorted.splice(args.newOrderIndex, 0, task);

    await ctx.db.patch(args.taskId, {
      taskDay: args.toDay,
      taskDayOrderIndex: args.newOrderIndex,
    });
    for (let i = 0; i < toSorted.length; i++) {
      if (toSorted[i]._id !== args.taskId && toSorted[i].taskDayOrderIndex !== i) {
        await ctx.db.patch(toSorted[i]._id, { taskDayOrderIndex: i });
      }
    }
  },
});

export const moveBetweenSections = mutation({
  args: {
    taskId: v.id("tasks"),
    toSectionId: v.id("listSections"),
    newOrderIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task?.listId) throw new Error("Task not found");
    if (task.userId !== user._id) throw new Error("Not authorized");

    const listId = task.listId;
    const sections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();
    if (sections.length === 0) throw new Error("No sections");

    const sectionIdSet = new Set(sections.map((s) => s._id));
    const toSection = await ctx.db.get(args.toSectionId);
    if (!toSection || toSection.listId !== listId) {
      throw new Error("Invalid section");
    }

    const canonicalDefault =
      sections.find((s) => s.isDefaultSection) ?? sections[0]!;

    const allOnList = await ctx.db
      .query("tasks")
      .withIndex("by_list", (q) => q.eq("listId", listId))
      .collect();

    const logicalSectionId = (t: (typeof allOnList)[number]) => {
      const sid = t.sectionId;
      if (sid && sectionIdSet.has(sid)) return sid;
      return canonicalDefault._id;
    };
    const bySec = new Map<
      (typeof sections)[number]["_id"],
      typeof allOnList
    >();
    for (const s of sections) {
      bySec.set(s._id, []);
    }
    for (const t of allOnList) {
      const lid = logicalSectionId(t);
      const arr = bySec.get(lid);
      if (arr) arr.push(t);
    }
    for (const [, arr] of bySec) {
      arr.sort(compareTasksForListReorder);
    }

    const fromSectionId = logicalSectionId(task);
    const fromArr = [...(bySec.get(fromSectionId) ?? [])];
    const fromIdx = fromArr.findIndex((t) => t._id === args.taskId);
    if (fromIdx === -1) throw new Error("Task not in list");

    const [moved] = fromArr.splice(fromIdx, 1);

    if (fromSectionId !== args.toSectionId) {
      for (let i = 0; i < fromArr.length; i++) {
        await ctx.db.patch(fromArr[i]._id, {
          sectionOrderIndex: i,
          sectionId: fromSectionId,
        });
      }
    }

    const toArr =
      fromSectionId === args.toSectionId
        ? fromArr
        : [...(bySec.get(args.toSectionId) ?? [])].filter(
            (t) => t._id !== args.taskId,
          );

    const insertAt = Math.min(
      Math.max(0, args.newOrderIndex),
      toArr.length,
    );
    toArr.splice(insertAt, 0, moved);

    for (let i = 0; i < toArr.length; i++) {
      const t = toArr[i];
      await ctx.db.patch(t._id, {
        sectionOrderIndex: i,
        sectionId: args.toSectionId,
      });
    }
  },
});

export const addToDay = mutation({
  args: { taskId: v.id("tasks"), day: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const dayTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).eq("taskDay", args.day)
      )
      .collect();
    const maxOrder = dayTasks.length > 0
      ? Math.max(...dayTasks.map((t) => t.taskDayOrderIndex))
      : -1;

    await ctx.db.patch(args.taskId, {
      taskDay: args.day,
      taskDayOrderIndex: maxOrder + 1,
    });
  },
});

export const removeFromDay = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await ctx.db.patch(args.taskId, {
      taskDay: undefined,
      taskDayOrderIndex: 0,
    });
  },
});

export const setTimeSpent = mutation({
  args: {
    taskId: v.id("tasks"),
    timeSpentInSecondsUnallocated: v.number(),
    /**
     * IANA zone of the user's *current* wall clock (browser
     * `Intl.DateTimeFormat().resolvedOptions().timeZone`).
     *
     * The client's optimistic patch uses this zone to compute the
     * synthetic slice's `startTimeHHMM` / `startDayYYYYMMDD`. The
     * server must use the SAME zone for the real slice it inserts,
     * otherwise the wall-clock fields differ and the displayed start
     * time jumps as soon as the optimistic cache is replaced by the
     * server response — that's the "moves back ~2 hours after 1
     * second" symptom users see when the inferred zone (Amsterdam /
     * UTC / etc., from older windows on this task) disagrees with the
     * browser zone (e.g. America/Vancouver today).
     *
     * Optional only because old clients may still call this mutation
     * without it; in that case we fall back to inference for
     * backwards compatibility.
     */
    timeZone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    /**
     * Reconcile task windows to match the newly requested total.
     *
     * - Decrease: trim/delete from latest windows backward (by wall-clock end
     *   instant when `startTimeEpochMs` exists).
     * - Increase: add a **new** ACTUAL slice ending at `Date.now()` with
     *   duration = delta (wall-clock via `inferIANAZoneForManualTaskSlice`; the
     *   client aligns optimistic patches with its grid TZ without mutation args).
     *
     * Note: we no longer patch `task.timeSpentInSecondsUnallocated` up
     * front — instead the per-window helpers (`onTimeWindowPatched` /
     * `onTimeWindowDeleted` / `onTimeWindowInserted`) keep the field
     * in step with every individual window mutation below. Otherwise we
     * would double-count: a pre-emptive patch plus per-window deltas.
     */
    const allWindows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const taskActualWindows = allWindows.filter(
      (w) => w.activityType === "TASK" && w.budgetType === "ACTUAL"
    );
    const currentTotal = taskActualWindows.reduce(
      (s, w) => s + (w.durationSeconds ?? 0),
      0
    );

    const desiredTotal = Math.max(0, args.timeSpentInSecondsUnallocated);
    if (desiredTotal === currentTotal) {
      // No window churn, but the task cache may still be stale (legacy
      // rows pre-bookkeeping). Snap it to the canonical value so the
      // home + list readers can trust the field on the next fetch.
      if ((task.timeSpentInSecondsUnallocated ?? 0) !== desiredTotal) {
        await ctx.db.patch(args.taskId, {
          timeSpentInSecondsUnallocated: desiredTotal,
        });
      }
      return;
    }

    if (desiredTotal < currentTotal) {
      let toTrim = currentTotal - desiredTotal;
      const newestFirst = [...taskActualWindows].sort(
        compareActualTaskWindowsNewestFirst,
      );

      for (const w of newestFirst) {
        if (toTrim <= 0) break;
        const dur = Math.max(0, w.durationSeconds ?? 0);
        if (dur <= toTrim) {
          await ctx.db.delete(w._id);
          await onTimeWindowDeleted(ctx, {
            taskId: w.taskId,
            activityType: w.activityType,
            budgetType: w.budgetType,
            durationSeconds: dur,
          });
          await onAttributedWindowDeleted(ctx, {
            trackableId: w.trackableId,
            budgetType: w.budgetType,
            durationSeconds: dur,
          });
          toTrim -= dur;
        } else {
          const nextDur = dur - toTrim;
          await ctx.db.patch(w._id, {
            durationSeconds: nextDur,
          });
          await onTimeWindowPatched(
            ctx,
            {
              taskId: w.taskId,
              activityType: w.activityType,
              budgetType: w.budgetType,
              durationSeconds: dur,
            },
            {
              taskId: w.taskId,
              activityType: w.activityType,
              budgetType: w.budgetType,
              durationSeconds: nextDur,
            },
          );
          await onAttributedWindowPatched(
            ctx,
            {
              trackableId: w.trackableId,
              budgetType: w.budgetType,
              durationSeconds: dur,
              startDayYYYYMMDD: w.startDayYYYYMMDD,
            },
            {
              trackableId: w.trackableId,
              budgetType: w.budgetType,
              durationSeconds: nextDur,
              startDayYYYYMMDD: w.startDayYYYYMMDD,
            },
          );
          toTrim = 0;
        }
      }
      return;
    }

    const deltaToAdd = desiredTotal - currentTotal;
    const deltaSec = Math.max(0, Math.floor(deltaToAdd));
    if (deltaSec <= 0) return;

    // Primary signal: the client's current browser zone. The
    // optimistic update on the client uses this exact zone, so using
    // it here too guarantees the wall-clock fields (startTimeHHMM /
    // startDayYYYYMMDD) the server inserts match the optimistic
    // placeholder the client just displayed — no visible jump when
    // the cache flips over to the server's value. Inference is only
    // a fallback for callers that haven't been updated yet.
    const tz =
      pickValidIANAZone(args.timeZone) ??
      (await inferIANAZoneForManualTaskSlice(ctx, user._id, args.taskId));

    const now = Date.now();
    const startEpochMs = now - deltaSec * 1000;
    const { startDayYYYYMMDD: day, startTimeHHMM } = wallClockInTimeZone(
      startEpochMs,
      tz,
    );

    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId = buildListIdToTrackableId(links);
    const snapshotTrackableId = resolveSnapshotTrackableIdForTask({
      task: { trackableId: task.trackableId, listId: task.listId },
      listIdToTrackableId,
    });

    await ctx.db.insert("timeWindows", {
      startTimeHHMM,
      startDayYYYYMMDD: day,
      startTimeEpochMs: startEpochMs,
      durationSeconds: deltaSec,
      userId: user._id,
      budgetType: "ACTUAL" as const,
      activityType: "TASK" as const,
      taskId: args.taskId,
      trackableId: snapshotTrackableId,
      timeZone: tz,
      isRecurringInstance: false,
      source: "manual" as const,
    });
    await onTimeWindowInserted(ctx, {
      taskId: args.taskId,
      activityType: "TASK" as const,
      budgetType: "ACTUAL" as const,
      durationSeconds: deltaSec,
    });
    if (snapshotTrackableId) {
      await onAttributedWindowInserted(ctx, {
        trackableId: snapshotTrackableId,
        durationSeconds: deltaSec,
        startDayYYYYMMDD: day,
      });
    }
  },
});

export const getTimeTracked = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return { totalSeconds: 0, sessions: [] };

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const actualWindows = windows.filter(
      (w) => w.budgetType === "ACTUAL" && w.activityType === "TASK"
    );

    const totalSeconds = actualWindows.reduce(
      (sum, w) => sum + w.durationSeconds,
      0
    );

    const byDay = new Map<string, typeof actualWindows>();
    for (const w of actualWindows) {
      const day = w.startDayYYYYMMDD;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(w);
    }

    const sessions = Array.from(byDay.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([day, dayWindows]) => ({
        day,
        totalSeconds: dayWindows.reduce((s, w) => s + w.durationSeconds, 0),
        windows: dayWindows
          .sort((a, b) => a.startTimeHHMM.localeCompare(b.startTimeHHMM))
          .map((w) => ({
            id: w._id,
            startTime: w.startTimeHHMM,
            durationSeconds: w.durationSeconds,
          })),
      }));

    return { totalSeconds, sessions };
  },
});
