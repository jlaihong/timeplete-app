/**
 * Maintains `tasks.timeSpentInSecondsUnallocated` as the canonical total
 * of TASK ACTUAL `timeWindows.durationSeconds` for that task.
 *
 * Background
 * ──────────
 * Historically the field was treated as "time spent that is not tracked
 * in a window" — but every writer that incremented it (e.g. `timers.stop`)
 * ALSO inserted a corresponding `timeWindows` row, so the field has been
 * stale for a long time and `enrichHomeTasksPayload` worked around it by
 * re-aggregating from `timeWindows` on every read. That re-aggregation
 * was the second-largest contributor to home-page read bandwidth (one
 * `by_task` scan per task per home subscription).
 *
 * To drop the per-read aggregation safely we keep the field
 * **authoritative** at write time and treat it as a cache that every
 * mutation that touches a TASK ACTUAL window must maintain. The contract
 * is now:
 *
 *   tasks.timeSpentInSecondsUnallocated
 *     === Σ timeWindows.durationSeconds
 *         WHERE timeWindows.taskId === task._id
 *           AND timeWindows.activityType === "TASK"
 *           AND timeWindows.budgetType === "ACTUAL"
 *
 * After backfill (`_admin/backfillTaskTimeSpent`) and the writer updates
 * below, readers can serve the field directly.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

interface TaskWindowFingerprint {
  taskId?: Id<"tasks">;
  activityType: "TASK" | "EVENT" | "TRACKABLE";
  budgetType: "ACTUAL" | "BUDGETED";
  durationSeconds: number;
}

function isTaskActualWindow(
  w: Pick<TaskWindowFingerprint, "taskId" | "activityType" | "budgetType">,
): boolean {
  return (
    w.activityType === "TASK" &&
    w.budgetType === "ACTUAL" &&
    w.taskId !== undefined
  );
}

async function adjustTaskTimeSpent(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  deltaSeconds: number,
): Promise<void> {
  if (deltaSeconds === 0) return;
  const task = await ctx.db.get(taskId);
  if (!task) return;
  const current = task.timeSpentInSecondsUnallocated ?? 0;
  const next = Math.max(0, current + deltaSeconds);
  if (next === current) return;
  await ctx.db.patch(taskId, {
    timeSpentInSecondsUnallocated: next,
  });
}

/**
 * Call after inserting a fresh `timeWindows` row. Adds the window's
 * duration to `task.timeSpentInSecondsUnallocated` when the window is a
 * TASK ACTUAL slice.
 */
export async function onTimeWindowInserted(
  ctx: MutationCtx,
  inserted: TaskWindowFingerprint,
): Promise<void> {
  if (!isTaskActualWindow(inserted)) return;
  await adjustTaskTimeSpent(
    ctx,
    inserted.taskId as Id<"tasks">,
    inserted.durationSeconds,
  );
}

/**
 * Call after patching an existing `timeWindows` row. Compares the
 * "before" snapshot (fetched prior to `ctx.db.patch(...)`) with the
 * post-patch fingerprint and applies whatever delta keeps each affected
 * task's `timeSpentInSecondsUnallocated` aligned.
 *
 * Handles every transition:
 *   - duration changed     → delta on the same task
 *   - taskId changed       → subtract from old task, add to new task
 *   - activityType/budgetType flipped into / out of TASK ACTUAL
 */
export async function onTimeWindowPatched(
  ctx: MutationCtx,
  before: TaskWindowFingerprint,
  after: TaskWindowFingerprint,
): Promise<void> {
  const beforeCounts = isTaskActualWindow(before);
  const afterCounts = isTaskActualWindow(after);

  if (
    beforeCounts &&
    afterCounts &&
    before.taskId === after.taskId
  ) {
    const delta = after.durationSeconds - before.durationSeconds;
    await adjustTaskTimeSpent(ctx, after.taskId as Id<"tasks">, delta);
    return;
  }

  if (beforeCounts) {
    await adjustTaskTimeSpent(
      ctx,
      before.taskId as Id<"tasks">,
      -before.durationSeconds,
    );
  }
  if (afterCounts) {
    await adjustTaskTimeSpent(
      ctx,
      after.taskId as Id<"tasks">,
      after.durationSeconds,
    );
  }
}

/** Call after deleting a `timeWindows` row. */
export async function onTimeWindowDeleted(
  ctx: MutationCtx,
  removed: TaskWindowFingerprint,
): Promise<void> {
  if (!isTaskActualWindow(removed)) return;
  await adjustTaskTimeSpent(
    ctx,
    removed.taskId as Id<"tasks">,
    -removed.durationSeconds,
  );
}
