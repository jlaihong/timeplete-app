/**
 * Subtasks: one level of child tasks under a task. See
 * `_helpers/subtasks.ts` for the data model.
 *
 * There is deliberately no way to move a subtask to another task or to
 * turn it into a task of its own: `move` only reorders within the parent.
 * To time a subtask, call `timers.startTaskTimer` with `subtaskId`; to
 * correct its time, `tasks.setTimeSpent` with the subtask's id.
 */
import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { claimClientMutationId } from "./_helpers/clientMutationId";
import {
  MAX_SUBTASKS,
  deleteSubtask,
  isSubtask,
  loadSubtasks,
  recountSubtasks,
} from "./_helpers/subtasks";

async function requireOwnSubtask(
  ctx: MutationCtx,
  userId: Id<"users">,
  id: Id<"tasks">,
): Promise<Doc<"tasks"> & { parentId: Id<"tasks"> }> {
  const subtask = await ctx.db.get(id);
  if (!subtask || subtask.userId !== userId || !subtask.parentId) {
    throw new Error("Subtask not found");
  }
  return subtask as Doc<"tasks"> & { parentId: Id<"tasks"> };
}

/** A task's subtasks, in order. */
export const list = query({
  args: { parentId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];
    const parent = await ctx.db.get(args.parentId);
    if (!parent || parent.userId !== user._id) return [];
    return await loadSubtasks(ctx, args.parentId);
  },
});

/** Add a subtask at the end of a task's subtasks. */
export const add = mutation({
  args: {
    parentId: v.id("tasks"),
    name: v.string(),
    clientMutationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    if (!(await claimClientMutationId(ctx, user._id, args.clientMutationId))) {
      return null;
    }
    const name = args.name.trim();
    if (!name) throw new Error("A subtask needs a name");

    const parent = await ctx.db.get(args.parentId);
    if (!parent || parent.userId !== user._id) {
      throw new Error("Task not found");
    }
    // One level only.
    if (isSubtask(parent)) throw new Error("A subtask cannot have subtasks");

    const siblings = await loadSubtasks(ctx, args.parentId);
    if (siblings.length >= MAX_SUBTASKS) {
      throw new Error(`A task can have at most ${MAX_SUBTASKS} subtasks`);
    }
    const nextOrder =
      siblings.reduce((max, t) => Math.max(max, t.subtaskOrderIndex ?? 0), -1) +
      1;

    const id = await ctx.db.insert("tasks", {
      name,
      parentId: args.parentId,
      rootTaskId: args.parentId,
      subtaskOrderIndex: nextOrder,
      timeSpentInSecondsUnallocated: 0,
      timeEstimatedInSecondsUnallocated: 0,
      taskDayOrderIndex: 0,
      sectionOrderIndex: 0,
      isRecurringInstance: false,
      userId: user._id,
      createdBy: user._id,
    });
    await recountSubtasks(ctx, args.parentId);
    return id;
  },
});

export const rename = mutation({
  args: { id: v.id("tasks"), name: v.string() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const subtask = await requireOwnSubtask(ctx, user._id, args.id);
    const name = args.name.trim();
    if (!name) throw new Error("A subtask needs a name");
    if (name !== subtask.name) await ctx.db.patch(args.id, { name });
    return null;
  },
});

/** Tick or untick a subtask. `day` is the user's today, `YYYYMMDD`. */
export const setCompleted = mutation({
  args: {
    id: v.id("tasks"),
    completed: v.boolean(),
    day: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const subtask = await requireOwnSubtask(ctx, user._id, args.id);
    if (!!subtask.dateCompleted === args.completed) return null;
    await ctx.db.patch(args.id, {
      dateCompleted: args.completed ? args.day : undefined,
    });
    await recountSubtasks(ctx, subtask.parentId);
    return null;
  },
});

/** Reorder a subtask within its task: it lands at position `toIndex`. */
export const move = mutation({
  args: { id: v.id("tasks"), toIndex: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const subtask = await requireOwnSubtask(ctx, user._id, args.id);
    const siblings = await loadSubtasks(ctx, subtask.parentId);
    const others = siblings.filter((t) => t._id !== args.id);
    const toIndex = Math.max(
      0,
      Math.min(others.length, Math.floor(args.toIndex)),
    );
    const ordered = [
      ...others.slice(0, toIndex),
      subtask,
      ...others.slice(toIndex),
    ];
    for (let i = 0; i < ordered.length; i++) {
      if (ordered[i].subtaskOrderIndex !== i) {
        await ctx.db.patch(ordered[i]._id, { subtaskOrderIndex: i });
      }
    }
    return null;
  },
});

/**
 * Delete a subtask. Time tracked on it stays on the parent task (and on
 * the calendar); only the link to the subtask goes.
 */
export const remove = mutation({
  args: { id: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const subtask = await requireOwnSubtask(ctx, user._id, args.id);
    await deleteSubtask(ctx, subtask);
    return null;
  },
});
