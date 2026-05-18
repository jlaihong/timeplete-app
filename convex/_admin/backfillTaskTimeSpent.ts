/**
 * One-shot backfill for `tasks.timeSpentInSecondsUnallocated` so it
 * matches the canonical sum of attributed TASK ACTUAL `timeWindows`.
 *
 * Before fix #4 the field was treated as a stale cache: writers updated
 * it inconsistently and `enrichHomeTasksPayload` rebuilt the total from
 * `timeWindows` on every home/list read (a per-task `by_task` scan that
 * was the second-largest source of home-page read bandwidth).
 *
 * After this backfill plus the writer changes (`_helpers/taskTimeSpent`),
 * the field is the source of truth and readers serve it directly with
 * no aggregation. Idempotent — running twice converges to the same
 * value. Invoked via
 *
 *   npx convex run _admin/backfillTaskTimeSpent:runAll
 *
 * for the current dataset size. Larger datasets should paginate via
 * `runBatch` externally.
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";

interface BackfillBatchResult {
  nextAfter: number | null;
  scanned: number;
  patched: number;
  done: boolean;
}

async function backfillBatch(
  ctx: MutationCtx,
  afterCreationTime: number,
  limit: number,
): Promise<BackfillBatchResult> {
  const batch: Doc<"tasks">[] = await ctx.db
    .query("tasks")
    .order("asc")
    .filter((q) => q.gt(q.field("_creationTime"), afterCreationTime))
    .take(limit + 1);

  const hasMore = batch.length > limit;
  const slice = hasMore ? batch.slice(0, limit) : batch;

  let patched = 0;
  for (const task of slice) {
    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    const total = windows
      .filter((w) => w.activityType === "TASK" && w.budgetType === "ACTUAL")
      .reduce((s, w) => s + (w.durationSeconds ?? 0), 0);

    if ((task.timeSpentInSecondsUnallocated ?? 0) === total) continue;

    await ctx.db.patch(task._id, {
      timeSpentInSecondsUnallocated: total,
    });
    patched++;
  }

  const last = slice[slice.length - 1];
  return {
    nextAfter: hasMore && last ? last._creationTime : null,
    scanned: slice.length,
    patched,
    done: !hasMore,
  };
}

export const runBatch = internalMutation({
  args: {
    afterCreationTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackfillBatchResult> => {
    return await backfillBatch(
      ctx,
      args.afterCreationTime ?? -1,
      args.limit ?? 300,
    );
  },
});

export const runAll = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 300;
    let after: number = -1;
    let totalScanned = 0;
    let totalPatched = 0;
    const maxIterations = 200;
    for (let i = 0; i < maxIterations; i++) {
      const result = await backfillBatch(ctx, after, limit);
      totalScanned += result.scanned;
      totalPatched += result.patched;
      if (result.done) {
        return {
          iterations: i + 1,
          scanned: totalScanned,
          patched: totalPatched,
        };
      }
      after = result.nextAfter ?? after;
    }
    throw new Error(
      `backfillTaskTimeSpent.runAll exceeded ${maxIterations} batches — fall back to manual pagination.`,
    );
  },
});

/** Read-only audit. Reports how many tasks still need to be backfilled. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    let pending = 0;
    let upToDate = 0;
    for (const task of tasks) {
      const windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      const total = windows
        .filter((w) => w.activityType === "TASK" && w.budgetType === "ACTUAL")
        .reduce((s, w) => s + (w.durationSeconds ?? 0), 0);
      if ((task.timeSpentInSecondsUnallocated ?? 0) === total) upToDate++;
      else pending++;
    }
    return { totalTasks: tasks.length, upToDate, pending };
  },
});
