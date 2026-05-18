/**
 * One-shot backfill for the denormalized `tasks.tagIds` field added in
 * the bandwidth-reduction pass.
 *
 * `tasks.tagIds` mirrors the `taskTags(taskId, tagId)` rows so that hot
 * readers like `tasks.search`, `lists.getPaginated`, and the home task
 * payload can enrich tags without scanning the entire `taskTags` table
 * (the old enrichment was the largest single contributor to dashboard
 * `Reads` bandwidth for list views).
 *
 * Going forward `tasks.upsert` and `recurringTasks.generateInstances`
 * keep this field in sync; this backfill is only needed once to seed
 * pre-existing rows.
 *
 * Invoked via `npx convex run _admin/backfillTaskTagIds:runAll` for
 * small datasets or `runBatch` paginated externally for larger ones.
 * Idempotent — running it twice produces the same final state.
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

interface BackfillBatchResult {
  /** `_creationTime` cursor for the next batch (exclusive lower bound). */
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
  // Tasks are scanned in `_creationTime` order so successive batches are
  // deterministic. `.take(limit + 1)` lets us tell whether more work
  // remains without a separate counter.
  const batch: Doc<"tasks">[] = await ctx.db
    .query("tasks")
    .order("asc")
    .filter((q) => q.gt(q.field("_creationTime"), afterCreationTime))
    .take(limit + 1);

  const hasMore = batch.length > limit;
  const slice = hasMore ? batch.slice(0, limit) : batch;

  let patched = 0;
  for (const task of slice) {
    const tts = await ctx.db
      .query("taskTags")
      .withIndex("by_task", (q) => q.eq("taskId", task._id))
      .collect();
    const desired: Id<"tags">[] = tts.map((tt) => tt.tagId);

    // Already in sync — skip the write to keep the backfill idempotent
    // and avoid burning bandwidth re-emitting identical patches.
    if (sameTagIds(task.tagIds ?? [], desired)) continue;

    await ctx.db.patch(task._id, {
      tagIds: desired.length === 0 ? undefined : desired,
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

/**
 * Backfills a bounded number of tasks per invocation, paginated by
 * `_creationTime` so each batch stays well below Convex's per-mutation
 * limits. Run repeatedly with the returned `nextAfter` cursor until
 * `done === true`.
 */
export const runBatch = internalMutation({
  args: {
    /** Strict lower bound on `_creationTime`. Null/undefined means start. */
    afterCreationTime: v.optional(v.number()),
    /** Maximum number of tasks to process this batch. */
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BackfillBatchResult> => {
    return await backfillBatch(
      ctx,
      args.afterCreationTime ?? -1,
      args.limit ?? 500,
    );
  },
});

/**
 * Drives `backfillBatch` to completion in a single invocation. Safe for
 * the current dataset (single user, ~hundreds of tasks). For larger
 * datasets prefer `runBatch` paginated externally so each transaction
 * stays small.
 */
export const runAll = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
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
      `backfillTaskTagIds.runAll exceeded ${maxIterations} batches — fall back to manual pagination.`,
    );
  },
});

function sameTagIds(
  a: ReadonlyArray<Id<"tags">>,
  b: ReadonlyArray<Id<"tags">>,
): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) return false;
  }
  return true;
}

/** Read-only audit. Reports how many tasks still need to be backfilled. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db.query("tasks").collect();
    let pending = 0;
    let upToDate = 0;
    for (const task of tasks) {
      const tts = await ctx.db
        .query("taskTags")
        .withIndex("by_task", (q) => q.eq("taskId", task._id))
        .collect();
      const desired = tts.map((tt) => tt.tagId);
      if (sameTagIds(task.tagIds ?? [], desired)) upToDate++;
      else pending++;
    }
    return { totalTasks: tasks.length, upToDate, pending };
  },
});
