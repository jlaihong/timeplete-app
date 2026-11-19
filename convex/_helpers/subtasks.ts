/**
 * Subtasks: one level of child tasks under a task.
 *
 * A subtask is a `tasks` row with `parentId` set (and `rootTaskId` equal
 * to it). It carries a name, a completion date and tracked time; it has no
 * day, list or trackable of its own and never appears as a row of its own
 * on Home or in a list. Its parent keeps `subtaskCount` /
 * `subtaskCompletedCount` so a task row can show "2/5" without loading
 * the subtasks.
 *
 * Time tracked on a subtask is a `timeWindows` row on the PARENT
 * (`taskId`) tagged with `subtaskId`; see `_helpers/taskTimeSpent`.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/** A task can hold at most this many subtasks. */
export const MAX_SUBTASKS = 100;

export function isSubtask(task: Pick<Doc<"tasks">, "parentId">): boolean {
  return task.parentId !== undefined;
}

/** A task's subtasks, in their order. */
export async function loadSubtasks(
  ctx: QueryCtx | MutationCtx,
  parentId: Id<"tasks">,
): Promise<Doc<"tasks">[]> {
  // `by_root` also returns the parent itself (a root task's `rootTaskId`
  // is its own id), hence the `parentId` check.
  const rows = await ctx.db
    .query("tasks")
    .withIndex("by_root", (q) => q.eq("rootTaskId", parentId))
    .take(MAX_SUBTASKS + 1);
  return rows
    .filter((t) => t.parentId === parentId)
    .sort(
      (a, b) =>
        (a.subtaskOrderIndex ?? 0) - (b.subtaskOrderIndex ?? 0) ||
        a._creationTime - b._creationTime,
    );
}

/** Bring the parent's subtask counts in line with its subtasks. */
export async function recountSubtasks(
  ctx: MutationCtx,
  parentId: Id<"tasks">,
): Promise<void> {
  const parent = await ctx.db.get(parentId);
  if (!parent) return;
  const subtasks = await loadSubtasks(ctx, parentId);
  const count = subtasks.length;
  const done = subtasks.filter((t) => !!t.dateCompleted).length;
  const nextCount = count > 0 ? count : undefined;
  const nextDone = count > 0 ? done : undefined;
  if (
    parent.subtaskCount !== nextCount ||
    parent.subtaskCompletedCount !== nextDone
  ) {
    await ctx.db.patch(parentId, {
      subtaskCount: nextCount,
      subtaskCompletedCount: nextDone,
    });
  }
}

/**
 * Completing a task completes its open subtasks too. (The reverse does
 * not hold: finishing the last subtask leaves the task open, and
 * reopening the task leaves its subtasks as they are.)
 */
export async function completeOpenSubtasks(
  ctx: MutationCtx,
  parentId: Id<"tasks">,
  dateCompleted: string,
): Promise<void> {
  const subtasks = await loadSubtasks(ctx, parentId);
  let changed = false;
  for (const subtask of subtasks) {
    if (subtask.dateCompleted) continue;
    await ctx.db.patch(subtask._id, { dateCompleted });
    changed = true;
  }
  if (changed) await recountSubtasks(ctx, parentId);
}

/**
 * Delete a task's subtasks. Call when the parent row is being deleted;
 * the parent's time windows (which hold the subtasks' time) are the
 * caller's to delete.
 */
export async function deleteSubtasksOf(
  ctx: MutationCtx,
  parentId: Id<"tasks">,
): Promise<void> {
  for (const subtask of await loadSubtasks(ctx, parentId)) {
    await ctx.db.delete(subtask._id);
  }
}

/**
 * Delete one subtask. The time tracked on it stays on the parent task:
 * the windows lose their `subtaskId` and nothing else. A timer running on
 * it carries on as a timer on the parent.
 */
export async function deleteSubtask(
  ctx: MutationCtx,
  subtask: Doc<"tasks">,
): Promise<void> {
  for (;;) {
    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_subtask", (q) => q.eq("subtaskId", subtask._id))
      .take(200);
    if (windows.length === 0) break;
    for (const w of windows) {
      await ctx.db.patch(w._id, { subtaskId: undefined });
    }
  }
  const timer = await ctx.db
    .query("taskTimers")
    .withIndex("by_user", (q) => q.eq("userId", subtask.userId))
    .first();
  if (timer?.subtaskId === subtask._id) {
    await ctx.db.patch(timer._id, { subtaskId: undefined });
  }
  await ctx.db.delete(subtask._id);
  if (subtask.parentId) await recountSubtasks(ctx, subtask.parentId);
}
