/**
 * Destructive wipe helpers for migration rehearsals.
 *
 * `scripts/migration/wipe.ts` drives these to empty the target deployment
 * before a clean re-import from the Supabase dump:
 *
 *   1. `wipeTable`     — batched delete of one app table.
 *   2. `wipeAuthModel` — batched delete of one Better Auth component model
 *                        (user / session / account / verification), so
 *                        re-imported users go back through the
 *                        Cognito-fallback first-login flow.
 *   3. `countAll`      — row counts for before/after verification.
 *
 * Both wipe mutations are batched (one transaction per call) so a large
 * table can't blow the per-mutation write limit; callers loop until
 * `done`. Like the rest of `_admin/`, delete after Phase 6 cleanup.
 */

import { internalMutation, internalQuery } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";

/**
 * Every app table that holds migrated or user-generated data. Kept in
 * dependency-free (flat) form — deletion order doesn't matter in Convex
 * since there are no FK constraints at the storage layer.
 */
const APP_TABLES = [
  "tags",
  "lists",
  "listSections",
  "tasks",
  "taskTags",
  "taskDays",
  "userTaskDayOrder",
  "taskListOrdering",
  "rootTaskOrdering",
  "timeWindows",
  "taskTimers",
  "pendingTimerReviews",
  "trackables",
  "trackableDays",
  "trackableDaySeconds",
  "trackerEntries",
  "listTrackableLinks",
  "reviewQuestions",
  "reviewAnswers",
  "taskComments",
  "recurringTasks",
  "deletedRecurringOccurrences",
  "recurringEvents",
  "deletedRecurringEventOccurrences",
  "trackableShares",
  "listShares",
  "pendingListInvites",
  "pushTokens",
  "users",
] as const;

export const wipeTable = internalMutation({
  args: {
    table: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ deleted: number; done: boolean }> => {
    if (!(APP_TABLES as readonly string[]).includes(args.table)) {
      throw new Error(`Refusing to wipe unknown table ${args.table}`);
    }
    const limit = args.limit ?? 2000;
    const rows = await ctx.db
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .query(args.table as any)
      .take(limit + 1);
    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;
    for (const row of slice) {
      await ctx.db.delete(row._id);
    }
    return { deleted: slice.length, done: !hasMore };
  },
});

/**
 * Better Auth component models that hold per-user auth state. `jwks` is
 * deliberately NOT wiped — the deployment's signing keys are unrelated to
 * user data and regenerating them buys nothing.
 */
const AUTH_MODELS = ["session", "account", "verification", "user"] as const;

export const wipeAuthModel = internalMutation({
  args: {
    model: v.string(),
    numItems: v.optional(v.number()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{ deleted: number; done: boolean }> => {
    if (!(AUTH_MODELS as readonly string[]).includes(args.model)) {
      throw new Error(`Refusing to wipe unknown auth model ${args.model}`);
    }
    const res = await ctx.runMutation(components.betterAuth.adapter.deleteMany, {
      input: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        model: args.model as any,
      },
      paginationOpts: { numItems: args.numItems ?? 500, cursor: null },
    });
    return { deleted: res.count, done: res.isDone };
  },
});

/** Row counts for every app table (verification before/after wipe+load). */
export const countAll = internalQuery({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const counts: Record<string, number> = {};
    for (const table of APP_TABLES) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await ctx.db.query(table as any).collect();
      counts[table] = rows.length;
    }
    return counts;
  },
});
