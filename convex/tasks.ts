import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

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
      sectionId: args.sectionId,
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
     * Reconcile time windows so manual edits are visible to ALL analytics
     * surfaces (productivity-one parity: trackable totals are window-driven,
     * never field-driven).
     *
     * Strategy: maintain at most ONE `source: "manual"` window per task. Its
     * duration absorbs the difference between the user-entered total and the
     * sum of timer/calendar windows for that task. If the user manually
     * lowers the total below what timers logged, we clamp the manual window
     * to 0 (we never destroy timer-recorded work).
     */
    const allWindows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    const manualWindows = allWindows.filter((w) => w.source === "manual");
    const nonManualSum = allWindows
      .filter((w) => w.source !== "manual")
      .reduce((s, w) => s + (w.durationSeconds ?? 0), 0);

    const desiredManualSeconds = Math.max(
      0,
      args.timeSpentInSecondsUnallocated - nonManualSum
    );

    if (desiredManualSeconds === 0) {
      for (const w of manualWindows) await ctx.db.delete(w._id);
      return;
    }

    if (manualWindows.length > 0) {
      // Keep the first manual window, fold any extras into it (defensive).
      const [primary, ...extras] = manualWindows;
      for (const e of extras) await ctx.db.delete(e._id);
      await ctx.db.patch(primary._id, {
        durationSeconds: desiredManualSeconds,
      });
      return;
    }

    // No manual window yet → create one for the task's day (or today).
    const day =
      task.taskDay ??
      (() => {
        const now = new Date();
        return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      })();
    const tz = "UTC";

    // Intentionally leave trackableId unset on the manual window. Manual
    // entries represent the user editing the task's total time, not work
    // logged at a specific moment, so they should follow the task's CURRENT
    // trackable (resolved at query time via `resolveAttributedTrackableId`)
    // rather than carry a frozen snapshot.
    await ctx.db.insert("timeWindows", {
      startTimeHHMM: "00:00",
      startDayYYYYMMDD: day,
      durationSeconds: desiredManualSeconds,
      userId: user._id,
      budgetType: "ACTUAL" as const,
      activityType: "TASK" as const,
      taskId: args.taskId,
      timeZone: tz,
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
