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
    dateCompleted: v.optional(v.string()),
    timeSpentInSecondsUnallocated: v.optional(v.number()),
    timeEstimatedInSecondsUnallocated: v.optional(v.number()),
    dueDateYYYYMMDD: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    taskDay: v.optional(v.string()),
    taskDayOrderIndex: v.optional(v.number()),
    sectionId: v.optional(v.id("listSections")),
    sectionOrderIndex: v.optional(v.number()),
    trackableId: v.optional(v.id("trackables")),
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
      if (args.dateCompleted !== undefined) patch.dateCompleted = args.dateCompleted;
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
      if (args.trackableId !== undefined) patch.trackableId = args.trackableId;
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
      dateCompleted: args.dateCompleted,
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated ?? 0,
      timeEstimatedInSecondsUnallocated: args.timeEstimatedInSecondsUnallocated ?? 0,
      dueDateYYYYMMDD: args.dueDateYYYYMMDD,
      listId: args.listId,
      taskDay: args.taskDay,
      taskDayOrderIndex: args.taskDayOrderIndex ?? 0,
      sectionId: args.sectionId,
      sectionOrderIndex: args.sectionOrderIndex ?? 0,
      trackableId: args.trackableId,
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
    await ctx.db.patch(args.taskId, {
      taskDay: args.toDay,
      taskDayOrderIndex: args.newOrderIndex,
    });
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
    await ctx.db.patch(args.taskId, {
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated,
    });
  },
});
