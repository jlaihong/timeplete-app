import { query, mutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";

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

export const search = query({
  args: {
    startDay: v.optional(v.string()),
    endDay: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    trackableId: v.optional(v.id("trackables")),
    includeCompleted: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

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

    const taskTagsAll = await ctx.db
      .query("taskTags")
      .withIndex("by_task")
      .collect();
    const tagMap = new Map<string, string[]>();
    for (const tt of taskTagsAll) {
      if (!tagMap.has(tt.taskId)) tagMap.set(tt.taskId, []);
      tagMap.get(tt.taskId)!.push(tt.tagId);
    }

    return tasks
      .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex)
      .map((t) => ({
        ...t,
        tagIds: tagMap.get(t._id) ?? [],
      }));
  },
});

/**
 * Home-page task query.
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
    const user = await requireApprovedUser(ctx);
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

    // 2. Overdue tasks: taskDay < today, incomplete, not a recurring instance.
    //    Index range scan limits us to past tasks for this user only;
    //    the in-memory filter narrows further to incomplete + non-recurring.
    const pastTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).lt("taskDay", today)
      )
      .collect();

    const overdueTasks = pastTasks.filter(
      (t) =>
        t.taskDay !== undefined &&
        !t.dateCompleted &&
        !t.isRecurringInstance
    );

    // 3. Tasks completed inside [today, rangeEnd] but originally scheduled
    //    before today – we want them to render in their completion-day
    //    bucket (matching productivity-one's grouping). Pull from past
    //    incomplete-task-set's complement: scan past tasks, keep ones whose
    //    dateCompleted falls in window.
    const completedInWindow = pastTasks.filter(
      (t) =>
        t.taskDay !== undefined &&
        t.dateCompleted !== undefined &&
        t.dateCompleted >= today &&
        t.dateCompleted <= rangeEnd
    );

    // De-dupe by id – overdueTasks and rangeTasks should be disjoint, but
    // completedInWindow can overlap with neither (different selectors).
    const byId = new Map<string, (typeof rangeTasks)[number]>();
    for (const t of overdueTasks) byId.set(t._id, t);
    for (const t of rangeTasks) byId.set(t._id, t);
    for (const t of completedInWindow) byId.set(t._id, t);
    const tasks = Array.from(byId.values());

    // Tag map – scoped to the tasks we're actually returning. The previous
    // implementation collected the entire `taskTags` table on every refetch,
    // which dominated the cost of post-mutation re-renders.
    const tagMap = new Map<string, string[]>();
    const timeSpentMap = new Map<string, number>();
    await Promise.all(
      tasks.map(async (t) => {
        const tts = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        if (tts.length > 0) {
          tagMap.set(
            t._id,
            tts.map((tt) => tt.tagId)
          );
        }

        // Use time windows as the authoritative source for row-level "time
        // spent" so recurring instances with planned calendar windows show
        // consistent durations in the task panel.
        const windows = await ctx.db
          .query("timeWindows")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        const totalFromWindows = windows
          .filter((w) => w.activityType === "TASK" && w.budgetType === "ACTUAL")
          .reduce((s, w) => s + (w.durationSeconds ?? 0), 0);
        timeSpentMap.set(t._id, totalFromWindows);
      })
    );

    return tasks
      .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex)
      .map((t) => ({
        ...t,
        timeSpentInSecondsUnallocated:
          timeSpentMap.get(t._id) ??
          t.timeSpentInSecondsUnallocated ??
          0,
        tagIds: tagMap.get(t._id) ?? [],
      }));
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
    const user = await requireApprovedUser(ctx);

    let allTasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    if (args.collaboratorIds && args.collaboratorIds.length > 0) {
      const collabSet = new Set(args.collaboratorIds);
      for (const collabId of args.collaboratorIds) {
        const collabTasks = await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", collabId))
          .collect();
        allTasks = [...allTasks, ...collabTasks];
      }
    }

    let filtered = allTasks.filter((t) => {
      for (const range of args.dayRanges) {
        if (t.taskDay && t.taskDay >= range.startDay && t.taskDay <= range.endDay) {
          return true;
        }
      }
      return false;
    });

    if (args.includeCompleted && args.completedStartDay) {
      const completed = allTasks.filter(
        (t) =>
          t.dateCompleted &&
          t.dateCompleted >= (args.completedStartDay ?? "") &&
          t.dateCompleted <= (args.completedEndDay ?? "99999999")
      );
      const ids = new Set(filtered.map((t) => t._id));
      for (const c of completed) {
        if (!ids.has(c._id)) filtered.push(c);
      }
    }

    return filtered.sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex);
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
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Task not found");

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
    });

    await ctx.db.patch(taskId, { rootTaskId: args.parentId ? undefined : taskId });

    if (args.tagIds) {
      for (const tagId of args.tagIds) {
        await ctx.db.insert("taskTags", { taskId, tagId });
      }
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
    await ctx.db.patch(args.taskId, {
      sectionId: args.toSectionId,
      sectionOrderIndex: args.newOrderIndex,
    });
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
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");

    await ctx.db.patch(args.taskId, {
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated,
    });

    /**
     * Reconcile task windows to match the newly requested total.
     *
     * - Decrease: trim/delete from latest windows backward.
     * - Increase: extend the latest existing task window (P1 behavior).
     *   If no task windows exist yet, create a manual window.
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
    if (desiredTotal === currentTotal) return;

    if (desiredTotal < currentTotal) {
      let toTrim = currentTotal - desiredTotal;
      const newestFirst = [...taskActualWindows].sort((a, b) => {
        const dayCmp = (b.startDayYYYYMMDD ?? "").localeCompare(
          a.startDayYYYYMMDD ?? ""
        );
        if (dayCmp !== 0) return dayCmp;
        return (b.startTimeHHMM ?? "").localeCompare(a.startTimeHHMM ?? "");
      });

      for (const w of newestFirst) {
        if (toTrim <= 0) break;
        const dur = Math.max(0, w.durationSeconds ?? 0);
        if (dur <= toTrim) {
          await ctx.db.delete(w._id);
          toTrim -= dur;
        } else {
          await ctx.db.patch(w._id, {
            durationSeconds: dur - toTrim,
          });
          toTrim = 0;
        }
      }
      return;
    }

    const deltaToAdd = desiredTotal - currentTotal;
    const newestFirst = [...taskActualWindows].sort((a, b) => {
      const dayCmp = (b.startDayYYYYMMDD ?? "").localeCompare(
        a.startDayYYYYMMDD ?? ""
      );
      if (dayCmp !== 0) return dayCmp;
      const timeCmp = (b.startTimeHHMM ?? "").localeCompare(a.startTimeHHMM ?? "");
      if (timeCmp !== 0) return timeCmp;
      return (b._creationTime ?? 0) - (a._creationTime ?? 0);
    });
    const latest = newestFirst[0];
    if (latest) {
      await ctx.db.patch(latest._id, {
        durationSeconds: Math.max(0, (latest.durationSeconds ?? 0) + deltaToAdd),
      });
      return;
    }

    const day =
      task.taskDay ??
      (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(
          now.getDate()
        ).padStart(2, "0")}`;
      })();

    await ctx.db.insert("timeWindows", {
      startTimeHHMM: "00:00",
      startDayYYYYMMDD: day,
      durationSeconds: deltaToAdd,
      userId: user._id,
      budgetType: "ACTUAL" as const,
      activityType: "TASK" as const,
      taskId: args.taskId,
      timeZone: "UTC",
      isRecurringInstance: false,
      source: "manual" as const,
    });
  },
});

export const getTimeTracked = query({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
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
