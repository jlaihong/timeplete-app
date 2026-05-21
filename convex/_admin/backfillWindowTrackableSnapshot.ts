/**
 * Backfill `timeWindows.trackableId` for legacy rows that have a `taskId`
 * (or `listId` for old EVENT/calendar imports) but no `trackableId`
 * snapshot.
 *
 * Why: `resolveAttributedTrackableId` prefers the snapshot — if it's
 * absent, the dynamic resolver falls through to `task.trackableId` then
 * `listTrackableLinks`. Because the dynamic path was the only correct
 * source for these windows, `getGoalDetails` had to pull every task in
 * the user's table to attribute them, which (combined with the windows
 * scan) was the dominant contributor to read bandwidth.
 *
 * After this backfill runs every ACTUAL window that should attribute to
 * a trackable has the snapshot stamped, so:
 *   1. Readers can rely on `window.trackableId` alone (no task lookup).
 *   2. The `trackables.lifetime*` denormalized totals can be re-derived
 *      to include the newly-attributed windows — caller is expected to
 *      re-run `_admin/backfillTrackableLifetime:runAll` afterwards.
 *
 * Idempotent: rows that already have a snapshot are skipped.
 *
 * Internal-only. Run from the dashboard / `npx convex run`.
 */

import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "../_generated/server";
import { v } from "convex/values";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "../_helpers/trackableAttribution";

type BatchResult = {
  scanned: number;
  patched: number;
  done: boolean;
  nextAfter?: number;
};

async function backfillBatch(
  ctx: MutationCtx,
  afterCreationTime: number,
  limit: number,
): Promise<BatchResult> {
  const batch = await ctx.db
    .query("timeWindows")
    .order("asc")
    .filter((q) => q.gt(q.field("_creationTime"), afterCreationTime))
    .take(limit + 1);

  const hasMore = batch.length > limit;
  const windows = hasMore ? batch.slice(0, limit) : batch;
  if (windows.length === 0) {
    return { scanned: 0, patched: 0, done: true };
  }

  let patched = 0;
  // Cache list→trackable links per user across the batch so we don't
  // re-collect the whole table for every row.
  const linkCacheByUser = new Map<
    string,
    Map<string, import("../_generated/dataModel").Id<"trackables">>
  >();

  for (const w of windows) {
    if (w.trackableId) continue;
    if (w.budgetType !== "ACTUAL") continue;

    let resolved: import("../_generated/dataModel").Id<"trackables"> | undefined;

    if (w.taskId) {
      const task = await ctx.db.get(w.taskId);
      if (task) {
        let linkMap = linkCacheByUser.get(task.userId);
        if (!linkMap) {
          const links = await ctx.db
            .query("listTrackableLinks")
            .withIndex("by_user", (q) => q.eq("userId", task.userId))
            .collect();
          linkMap = buildListIdToTrackableId(links);
          linkCacheByUser.set(task.userId, linkMap);
        }
        resolved = resolveSnapshotTrackableIdForTask({
          task: { trackableId: task.trackableId, listId: task.listId },
          listIdToTrackableId: linkMap,
        });
      }
    } else if (w.listId) {
      // Calendar EVENT / legacy bare-list rows.
      let linkMap = linkCacheByUser.get(w.userId);
      if (!linkMap) {
        const links = await ctx.db
          .query("listTrackableLinks")
          .withIndex("by_user", (q) => q.eq("userId", w.userId))
          .collect();
        linkMap = buildListIdToTrackableId(links);
        linkCacheByUser.set(w.userId, linkMap);
      }
      resolved = linkMap.get(w.listId) ?? undefined;
    }

    if (resolved) {
      await ctx.db.patch(w._id, { trackableId: resolved });
      patched++;
    }
  }

  const last = windows[windows.length - 1];
  return {
    scanned: windows.length,
    patched,
    done: !hasMore,
    nextAfter: hasMore && last ? last._creationTime : undefined,
  };
}

export const runBatch = internalMutation({
  args: {
    afterCreationTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<BatchResult> => {
    return await backfillBatch(
      ctx,
      args.afterCreationTime ?? -1,
      args.limit ?? 500,
    );
  },
});

export const runAll = internalMutation({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    let after = -1;
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
      `backfillWindowTrackableSnapshot.runAll exceeded ${maxIterations} batches — fall back to manual pagination.`,
    );
  },
});

export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const windows = await ctx.db.query("timeWindows").collect();
    let pending = 0;
    let alreadyAttributed = 0;
    let unattributable = 0;
    for (const w of windows) {
      if (w.trackableId) {
        alreadyAttributed++;
        continue;
      }
      if (w.budgetType !== "ACTUAL") {
        unattributable++;
        continue;
      }
      if (w.taskId || w.listId) {
        pending++;
      } else {
        unattributable++;
      }
    }
    return {
      total: windows.length,
      alreadyAttributed,
      pending,
      unattributable,
    };
  },
});
