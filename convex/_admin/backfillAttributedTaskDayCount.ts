/**
 * One-shot backfill for `trackables.lifetimeAttributedTaskDayCount`.
 *
 * Mirrors the dynamic aggregation `buildCompletedTaskCountsByTrackableDay`
 * used to perform on every fire of `getGoalDetails` /
 * `getTrackableAnalyticsSeries` — for every user, recomputes the
 * snapshot count of "completed tasks whose attribution resolves to
 * this trackable" and patches it onto each trackable.
 *
 * Going forward `tasks.upsert` and `tasks.remove` (and the equivalent
 * recurring-task delete paths) keep this field in sync via
 * `_helpers/trackableLifetime.onTaskCompletionAttribution`. This
 * backfill is only needed once to seed pre-existing rows.
 *
 * Idempotent — running it twice produces the same final state.
 */

import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "../_helpers/trackableAttribution";

async function computePerUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Map<string, number>> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .collect();
  const linkMap = buildListIdToTrackableId(links);

  // Range over all rows whose `dateCompleted` is a non-empty string (any
  // valid date sorts above ""). The index is `(userId, dateCompleted,
  // taskDay)` so this avoids scanning open tasks for the user.
  const tasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_completed_day", (q) =>
      q.eq("userId", userId).gt("dateCompleted", ""),
    )
    .collect();

  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (!t.dateCompleted) continue;
    const tid = resolveSnapshotTrackableIdForTask({
      task: { trackableId: t.trackableId, listId: t.listId },
      listIdToTrackableId: linkMap,
    });
    if (!tid) continue;
    counts.set(String(tid), (counts.get(String(tid)) ?? 0) + 1);
  }
  return counts;
}

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    let patched = 0;
    let touched = 0;
    let unchanged = 0;
    for (const user of users) {
      const expectedCounts = await computePerUser(ctx, user._id);
      const userTrackables = await ctx.db
        .query("trackables")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const t of userTrackables) {
        const expected = expectedCounts.get(String(t._id)) ?? 0;
        const current = t.lifetimeAttributedTaskDayCount ?? 0;
        if (current === expected) {
          unchanged++;
          continue;
        }
        await ctx.db.patch(t._id, {
          lifetimeAttributedTaskDayCount: expected,
        });
        patched++;
        touched++;
      }
    }
    return { users: users.length, patched, unchanged };
  },
});

export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users: Doc<"users">[] = await ctx.db.query("users").collect();
    let pending = 0;
    let upToDate = 0;
    for (const user of users) {
      const expectedCounts = await computePerUser(ctx, user._id);
      const userTrackables = await ctx.db
        .query("trackables")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const t of userTrackables) {
        const expected = expectedCounts.get(String(t._id)) ?? 0;
        const current = t.lifetimeAttributedTaskDayCount ?? 0;
        if (current === expected) upToDate++;
        else pending++;
      }
    }
    return { pending, upToDate };
  },
});
