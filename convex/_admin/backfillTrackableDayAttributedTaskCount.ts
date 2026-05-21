/**
 * One-shot backfill for `trackableDays.attributedTaskCount`.
 *
 * After this runs, `getGoalDetails` /
 * `getTrackableAnalyticsSeries` can compute per-day attributed-task
 * counts directly from the (already-small) `trackableDays` table
 * instead of scanning every completed task in the user's history —
 * the last big remaining contributor to home-page read bandwidth
 * after the lifetime + window-snapshot passes.
 *
 * Going forward `_helpers/trackableLifetime.onTaskCompletionAttribution`
 * keeps the field in sync via `tasks.upsert` and the recurring-task
 * delete paths. This backfill is only needed once to seed pre-existing
 * rows.
 *
 * Algorithm (per user):
 *   1. Walk completed tasks via `tasks.by_user_completed_day`.
 *   2. Resolve each task's attributed trackable (or skip).
 *   3. Bucket counts by `(trackableId, dayYYYYMMDD)`.
 *   4. For every bucket, upsert `trackableDays.attributedTaskCount`
 *      to match. Rows that don't exist (no manual numCompleted, no
 *      comments) are created with attributedTaskCount set.
 *   5. For any existing `trackableDays` row that we *didn't* bucket
 *      (i.e. expected count = 0) but currently stores a non-zero
 *      `attributedTaskCount`, reset it to zero.
 *
 * Idempotent — running it twice produces the same final state.
 */

import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "../_helpers/trackableAttribution";
import {
  isYYYYMMDDCompact,
  toCompactYYYYMMDD,
} from "../_helpers/compactYYYYMMDD";

async function computeBucketsForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Map<string, Map<string, number>>> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const linkMap = buildListIdToTrackableId(links);

  const completed = await ctx.db
    .query("tasks")
    .withIndex("by_user_completed_day", (q) =>
      q.eq("userId", userId).gt("dateCompleted", ""),
    )
    .collect();

  const buckets = new Map<string, Map<string, number>>();
  for (const t of completed) {
    if (!t.dateCompleted) continue;
    const tid = resolveSnapshotTrackableIdForTask({
      task: { trackableId: t.trackableId, listId: t.listId },
      listIdToTrackableId: linkMap,
    });
    if (!tid) continue;
    const day = toCompactYYYYMMDD(t.dateCompleted);
    if (!isYYYYMMDDCompact(day)) continue;
    const key = String(tid);
    let dayMap = buckets.get(key);
    if (!dayMap) {
      dayMap = new Map<string, number>();
      buckets.set(key, dayMap);
    }
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  return buckets;
}

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    let upserted = 0;
    let cleared = 0;
    let deletedEmpty = 0;
    for (const user of users) {
      const buckets = await computeBucketsForUser(ctx, user._id);
      const existingDays = await ctx.db
        .query("trackableDays")
        .withIndex("by_user_trackable", (q) => q.eq("userId", user._id))
        .collect();

      // Stage 1: zero-out rows we didn't bucket (drift).
      for (const row of existingDays) {
        const key = String(row.trackableId);
        const expected = buckets.get(key)?.get(row.dayYYYYMMDD) ?? 0;
        if (expected !== 0) continue;
        if ((row.attributedTaskCount ?? 0) === 0) continue;
        if (row.numCompleted === 0 && (row.comments ?? "") === "") {
          await ctx.db.delete(row._id);
          deletedEmpty++;
        } else {
          await ctx.db.patch(row._id, { attributedTaskCount: 0 });
          cleared++;
        }
      }

      // Stage 2: upsert rows for bucketed (trackable, day) pairs.
      const existingByKey = new Map<string, Doc<"trackableDays">>();
      for (const row of existingDays) {
        existingByKey.set(`${row.trackableId}|${row.dayYYYYMMDD}`, row);
      }
      for (const [trackableKey, dayMap] of buckets) {
        const trackableId = trackableKey as Id<"trackables">;
        for (const [day, count] of dayMap) {
          const k = `${trackableKey}|${day}`;
          const existing = existingByKey.get(k);
          if (!existing) {
            await ctx.db.insert("trackableDays", {
              trackableId,
              userId: user._id,
              dayYYYYMMDD: day,
              numCompleted: 0,
              attributedTaskCount: count,
              comments: "",
            });
            upserted++;
            continue;
          }
          if ((existing.attributedTaskCount ?? 0) === count) continue;
          await ctx.db.patch(existing._id, { attributedTaskCount: count });
          upserted++;
        }
      }
    }
    return { users: users.length, upserted, cleared, deletedEmpty };
  },
});

export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    let pending = 0;
    let upToDate = 0;
    for (const user of users) {
      const buckets = await computeBucketsForUser(ctx, user._id);
      const existingDays = await ctx.db
        .query("trackableDays")
        .withIndex("by_user_trackable", (q) => q.eq("userId", user._id))
        .collect();
      const existingByKey = new Map<string, Doc<"trackableDays">>();
      for (const row of existingDays) {
        existingByKey.set(`${row.trackableId}|${row.dayYYYYMMDD}`, row);
      }
      const seen = new Set<string>();
      for (const [tk, dayMap] of buckets) {
        for (const [day, count] of dayMap) {
          const k = `${tk}|${day}`;
          seen.add(k);
          const existing = existingByKey.get(k);
          if (!existing) pending++;
          else if ((existing.attributedTaskCount ?? 0) !== count) pending++;
          else upToDate++;
        }
      }
      for (const row of existingDays) {
        const k = `${row.trackableId}|${row.dayYYYYMMDD}`;
        if (seen.has(k)) continue;
        if ((row.attributedTaskCount ?? 0) !== 0) pending++;
      }
    }
    return { pending, upToDate };
  },
});
