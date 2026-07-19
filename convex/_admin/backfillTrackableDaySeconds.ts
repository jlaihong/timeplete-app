/**
 * One-shot backfill for the `trackableDaySeconds` table.
 *
 * After this runs, `getGoalDetails` computes `MINUTES_A_WEEK` overall
 * progress from these small per-(trackable, day) rows instead of
 * re-scanning every time window since the trackable's start day on
 * every reactive fire — previously ~86% of the user's `timeWindows`
 * table (~707 KB) per execution on real data, and the single largest
 * contributor to dashboard database bandwidth.
 *
 * Going forward `_helpers/trackableLifetime` keeps the rows in sync
 * (same call sites that maintain `lifetimeTotalSeconds`). This
 * backfill is only needed once to seed pre-existing history.
 *
 * Attribution matches the runtime writers (coalesce via
 * `resolveAttributedTrackableId`, ACTUAL windows only, positive
 * durations, valid compact day) so the seeded rows equal what the
 * incremental deltas would have produced.
 *
 * Idempotent — running it twice converges to the same final state.
 * Invoked via `npx convex run _admin/backfillTrackableDaySeconds:runAll`.
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
  resolveAttributedTrackableId,
  type TaskInfo,
} from "../_helpers/trackableAttribution";
import {
  isYYYYMMDDCompact,
  toCompactYYYYMMDD,
} from "../_helpers/compactYYYYMMDD";

/** Map<trackableId, Map<compactDay, seconds>> for one user's windows. */
async function computeBucketsForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  taskCache: Map<string, TaskInfo | null>,
): Promise<Map<string, Map<string, number>>> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const listMap = buildListIdToTrackableId(links);

  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  const buckets = new Map<string, Map<string, number>>();
  for (const w of windows) {
    if (w.budgetType !== "ACTUAL") continue;
    const dur = w.durationSeconds ?? 0;
    if (dur <= 0) continue;
    const day = toCompactYYYYMMDD(w.startDayYYYYMMDD);
    if (!isYYYYMMDDCompact(day)) continue;

    let taskInfo: TaskInfo | null = null;
    if (w.taskId) {
      const key = String(w.taskId);
      if (!taskCache.has(key)) {
        const task = await ctx.db.get(w.taskId);
        taskCache.set(
          key,
          task
            ? {
                trackableId: task.trackableId ?? null,
                listId: task.listId ?? null,
              }
            : null,
        );
      }
      taskInfo = taskCache.get(key) ?? null;
    }
    const taskInfoMap = new Map<string, TaskInfo>();
    if (w.taskId && taskInfo) taskInfoMap.set(String(w.taskId), taskInfo);

    const attributed = resolveAttributedTrackableId(w, taskInfoMap, listMap);
    if (!attributed) continue;

    const tid = String(attributed);
    let dayMap = buckets.get(tid);
    if (!dayMap) {
      dayMap = new Map<string, number>();
      buckets.set(tid, dayMap);
    }
    dayMap.set(day, (dayMap.get(day) ?? 0) + dur);
  }
  return buckets;
}

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    const taskCache = new Map<string, TaskInfo | null>();
    let inserted = 0;
    let patched = 0;
    let deleted = 0;
    for (const user of users) {
      const buckets = await computeBucketsForUser(ctx, user._id, taskCache);
      const existingRows = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      const existingByKey = new Map<string, Doc<"trackableDaySeconds">>();
      for (const row of existingRows) {
        existingByKey.set(`${row.trackableId}|${row.dayYYYYMMDD}`, row);
      }

      // Stage 1: remove / correct rows that drifted from the recompute.
      for (const row of existingRows) {
        const expected =
          buckets.get(String(row.trackableId))?.get(row.dayYYYYMMDD) ?? 0;
        if (expected === 0) {
          await ctx.db.delete(row._id);
          deleted++;
        } else if (row.attributedSeconds !== expected) {
          await ctx.db.patch(row._id, { attributedSeconds: expected });
          patched++;
        }
      }

      // Stage 2: insert rows for buckets with no existing row.
      for (const [trackableKey, dayMap] of buckets) {
        for (const [day, seconds] of dayMap) {
          if (existingByKey.has(`${trackableKey}|${day}`)) continue;
          await ctx.db.insert("trackableDaySeconds", {
            trackableId: trackableKey as Id<"trackables">,
            userId: user._id,
            dayYYYYMMDD: day,
            attributedSeconds: seconds,
          });
          inserted++;
        }
      }
    }
    return { users: users.length, inserted, patched, deleted };
  },
});

/** Read-only audit so we can verify the writers stay in sync. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    const taskCache = new Map<string, TaskInfo | null>();
    let pending = 0;
    let upToDate = 0;
    for (const user of users) {
      const buckets = await computeBucketsForUser(ctx, user._id, taskCache);
      const existingRows = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      const existingByKey = new Map<string, number>();
      for (const row of existingRows) {
        existingByKey.set(
          `${row.trackableId}|${row.dayYYYYMMDD}`,
          row.attributedSeconds,
        );
      }
      const seen = new Set<string>();
      for (const [tk, dayMap] of buckets) {
        for (const [day, seconds] of dayMap) {
          const k = `${tk}|${day}`;
          seen.add(k);
          if (existingByKey.get(k) === seconds) upToDate++;
          else pending++;
        }
      }
      for (const [k] of existingByKey) {
        if (!seen.has(k)) pending++;
      }
    }
    return { pending, upToDate };
  },
});
