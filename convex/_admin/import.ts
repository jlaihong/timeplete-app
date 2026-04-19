/**
 * One-shot migration entry points for moving data out of the old
 * productivity-app Postgres dump into the timeplete Convex backend.
 *
 * These are `internalMutation`s — they are NOT exposed as `api.*` endpoints,
 * so external clients cannot call them. They are invoked by the Node.js
 * loader script in `scripts/migration/load.ts`, which runs against the local
 * Convex backend with the project admin key from `.env.local`.
 *
 * Idempotency: every importer keys off `legacyId` (the original Postgres
 * UUID). Re-running an importer on a row whose `legacyId` is already present
 * returns the existing Convex `_id` and does NOT duplicate the row. This
 * means the migration can be re-run safely (e.g. after fixing a bug in the
 * extractor).
 *
 * After all migrating users have logged in once and their passwords have
 * been re-hashed via the Cognito-fallback flow, this entire `_admin/`
 * directory can be deleted (Phase 6 of the migration plan).
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { components } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

/**
 * Sentinel password marker stored in BA's `account.password` for accounts
 * whose real (Cognito-managed) password we don't yet know. The
 * Cognito-fallback HTTP endpoint will replace this with a real scrypt hash
 * the first time the user successfully authenticates with Cognito.
 *
 * Format: `MIGRATE:cognito:<email>` — the email is included as a sanity
 * check so we can log/verify what's being claimed.
 */
const cognitoSentinelPassword = (email: string) => `MIGRATE:cognito:${email}`;

/**
 * Sentinel `tokenIdentifier` written to migrated app `users` rows. A real
 * tokenIdentifier looks like `<CONVEX_SITE_URL>|<BA_user._id>`, but at
 * import time we don't yet know the BA user's `_id` (BA assigns it when
 * the row is inserted into the BA component) and even if we did, we can't
 * predict the user's first JWT precisely. So we store this placeholder and
 * the modified `users.store` mutation adopts the row by email match on
 * first login.
 */
const legacyTokenIdentifier = (legacyId: string) => `legacy:${legacyId}`;

/**
 * Insert a single user from the Postgres dump.
 *
 * Side effects (all idempotent):
 *  1. App `users` row keyed by `legacyId`.
 *  2. Better Auth `user` row keyed by email (BA enforces email uniqueness).
 *  3. Better Auth `account` row with `providerId="credential"` and
 *     `password=MIGRATE:cognito:<email>` so the Cognito-fallback endpoint
 *     can recognise it.
 *
 * Returns the app `users._id`.
 */
export const importUser = internalMutation({
  args: {
    legacyId: v.string(),
    email: v.string(),
    name: v.string(),
    isApproved: v.boolean(),
  },
  handler: async (ctx, args): Promise<Id<"users">> => {
    const existingApp = await ctx.db
      .query("users")
      .withIndex("by_legacy", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (existingApp) return existingApp._id;

    // Adopt an already-present app users row for this email (e.g. someone
    // who has already signed up to the new app via Better Auth before the
    // migration ran). Don't touch their BA user/account — they already have
    // a real password and login flow. Just stamp the legacyId so the rest
    // of the migration can wire their old data to this row.
    const existingAppByEmail = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", args.email))
      .first();
    if (existingAppByEmail) {
      await ctx.db.patch(existingAppByEmail._id, { legacyId: args.legacyId });
      return existingAppByEmail._id;
    }

    let baUserId: string;
    const existingBaUser = (await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "user",
        where: [{ field: "email", value: args.email }],
      },
    )) as { _id: string } | null;
    if (existingBaUser) {
      baUserId = existingBaUser._id;
    } else {
      const now = Date.now();
      const created = (await ctx.runMutation(
        components.betterAuth.adapter.create,
        {
          input: {
            model: "user",
            data: {
              name: args.name,
              email: args.email,
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            },
          },
        },
      )) as { _id: string } | null;
      if (!created) {
        throw new Error(`Failed to create BA user for ${args.email}`);
      }
      baUserId = created._id;
    }

    const existingBaAccount = (await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "account",
        where: [
          { field: "userId", value: baUserId },
          { field: "providerId", value: "credential" },
        ],
      },
    )) as { _id: string } | null;
    if (!existingBaAccount) {
      const now = Date.now();
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "account",
          data: {
            accountId: baUserId,
            providerId: "credential",
            userId: baUserId,
            password: cognitoSentinelPassword(args.email),
            createdAt: now,
            updatedAt: now,
          },
        },
      });
    }

    const appUserId = await ctx.db.insert("users", {
      tokenIdentifier: legacyTokenIdentifier(args.legacyId),
      name: args.name,
      email: args.email,
      isApproved: args.isApproved,
      legacyId: args.legacyId,
    });
    return appUserId;
  },
});

/**
 * Re-hash a user's password using Better Auth's `scrypt` config and
 * replace the `MIGRATE:cognito:*` sentinel in the BA `account.password`
 * column with the real hash. Called by the Cognito-fallback HTTP endpoint
 * once it has verified the user's Cognito ID token.
 *
 * Note: `hashPassword` from `better-auth/crypto` uses Web Crypto APIs
 * which are available in Convex's V8 isolate runtime, so this can run
 * inside a regular mutation (no "use node" required).
 */
export const rehashCognitoPassword = internalMutation({
  args: {
    email: v.string(),
    newPasswordHash: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const baUser = (await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "user",
        where: [{ field: "email", value: args.email }],
      },
    )) as { _id: string } | null;
    if (!baUser) {
      throw new Error(`No Better Auth user found for email ${args.email}`);
    }

    const account = (await ctx.runQuery(
      components.betterAuth.adapter.findOne,
      {
        model: "account",
        where: [
          { field: "userId", value: baUser._id },
          { field: "providerId", value: "credential" },
        ],
      },
    )) as { _id: string; password?: string | null } | null;
    if (!account) {
      throw new Error(`No credential account for user ${args.email}`);
    }
    if (
      typeof account.password !== "string" ||
      !account.password.startsWith("MIGRATE:cognito:")
    ) {
      throw new Error(
        `Account for ${args.email} is not in cognito-migration state`,
      );
    }

    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [{ field: "_id", value: account._id }],
        update: {
          password: args.newPasswordHash,
          updatedAt: Date.now(),
        },
      },
    });
  },
});

/**
 * Batched insert helper. The loader script computes legacyId-to-Convex-id
 * maps in memory and produces fully-resolved row payloads, so each importer
 * just needs to drop them into the right table and skip rows whose
 * `legacyId` is already present.
 *
 * Using a generic `v.any()` validator is intentional: this code is one-shot
 * migration plumbing that lives until Phase 6 cleanup, and the loader is
 * the only caller. We trade strict per-table validation for a single
 * compact entry point that handles all 25 data tables uniformly.
 */
export const importBatch = internalMutation({
  args: {
    table: v.string(),
    rows: v.array(v.any()),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    inserted: number;
    skipped: number;
    /**
     * `legacyId -> Convex _id` mapping for every row in this batch
     * (whether it was inserted by this call or was already present from a
     * previous run). The loader uses this to resolve foreign keys for
     * subsequent tables in dependency order.
     */
    mapping: Array<{ legacyId: string; id: string }>;
  }> => {
    const allowed = new Set([
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
      "trackables",
      "trackableDays",
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
    ]);
    if (!allowed.has(args.table)) {
      throw new Error(`Refusing to import into unknown table ${args.table}`);
    }

    let inserted = 0;
    let skipped = 0;
    const mapping: Array<{ legacyId: string; id: string }> = [];
    for (const row of args.rows) {
      if (typeof row?.legacyId !== "string" || row.legacyId.length === 0) {
        throw new Error(
          `Row missing legacyId for table ${args.table}: ${JSON.stringify(row).slice(0, 200)}`,
        );
      }
      const existing = await ctx.db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query(args.table as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_legacy" as any, (q: any) =>
          q.eq("legacyId", row.legacyId),
        )
        .unique();
      if (existing) {
        skipped++;
        mapping.push({ legacyId: row.legacyId, id: existing._id });
        continue;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const newId = await ctx.db.insert(args.table as any, row);
      inserted++;
      mapping.push({ legacyId: row.legacyId, id: newId });
    }
    return { inserted, skipped, mapping };
  },
});

/**
 * Second-pass patcher for `tasks` self-references. The loader inserts every
 * task with `parentId`/`rootTaskId` left undefined (because those FKs point
 * at other rows in the same table that may not have been inserted yet),
 * then calls this with fully-resolved Convex `_id` values to fill them in.
 *
 * Idempotent: rows whose `legacyId` doesn't resolve to an existing task
 * are silently skipped. Patches that would set a value to its current
 * value are still issued — Convex de-dupes them at the storage layer and
 * re-running the migration is harmless.
 */
export const patchTaskParents = internalMutation({
  args: {
    rows: v.array(
      v.object({
        legacyId: v.string(),
        parentId: v.optional(v.id("tasks")),
        rootTaskId: v.optional(v.id("tasks")),
      }),
    ),
  },
  handler: async (ctx, args): Promise<{ patched: number; missing: number }> => {
    let patched = 0;
    let missing = 0;
    for (const row of args.rows) {
      const t = await ctx.db
        .query("tasks")
        .withIndex("by_legacy", (q) => q.eq("legacyId", row.legacyId))
        .unique();
      if (!t) {
        missing++;
        continue;
      }
      const update: { parentId?: Id<"tasks">; rootTaskId?: Id<"tasks"> } = {};
      if (row.parentId !== undefined) update.parentId = row.parentId;
      if (row.rootTaskId !== undefined) update.rootTaskId = row.rootTaskId;
      if (Object.keys(update).length === 0) continue;
      await ctx.db.patch(t._id, update);
      patched++;
    }
    return { patched, missing };
  },
});

/**
 * One-shot backfill that strips dashes from every Postgres-formatted
 * `YYYY-MM-DD` value the migration loaded into a date column. The
 * Convex schema and every consumer (analytics, calendar, task lists,
 * recurring expansion, …) treat these fields as `YYYYMMDD` strings:
 *
 *   - `(addDays|startOf*|endOf*|formatYYYYMMDD)` in `lib/dates.ts`
 *     concatenate without separators.
 *   - Per-day analytics filters compare with `===`/`<`/`>` against
 *     a `YYYYMMDD` cursor (e.g.
 *     `getTrackableAnalyticsSeries`'s `w.startDayYYYYMMDD === day`).
 *
 * The Postgres dump however stored these as `YYYY-MM-DD`, so the
 * extractor wrote `"2026-04-18"` into Convex. Lifetime totals still
 * look right (no date comparison), but every windowed total comes back
 * as zero and lexicographic ranges silently truncate. This mutation
 * walks every affected table once and rewrites the bad values in
 * place; idempotent because it skips anything that already looks like
 * `YYYYMMDD`.
 *
 * After Phase 6 cleanup this mutation is removed alongside the rest of
 * `_admin/`.
 *
 * Run with:
 *   npx convex run _admin/import:backfillDateFormat '{}'
 */
export const backfillDateFormat = internalMutation({
  args: {},
  handler: async (
    ctx,
  ): Promise<{ table: string; field: string; patched: number }[]> => {
    const targets: { table: string; fields: string[] }[] = [
      { table: "tasks", fields: ["taskDay", "dueDateYYYYMMDD", "dateCompleted"] },
      { table: "taskDays", fields: ["dayYYYYMMDD"] },
      { table: "userTaskDayOrder", fields: ["taskDay"] },
      { table: "timeWindows", fields: ["startDayYYYYMMDD"] },
      { table: "trackables", fields: ["startDayYYYYMMDD", "endDayYYYYMMDD"] },
      { table: "trackableDays", fields: ["dayYYYYMMDD"] },
      { table: "trackerEntries", fields: ["dayYYYYMMDD"] },
      { table: "reviewAnswers", fields: ["dayUnderReview"] },
      { table: "recurringTasks", fields: ["startDateYYYYMMDD", "endDateYYYYMMDD"] },
      { table: "recurringEvents", fields: ["startDateYYYYMMDD", "endDateYYYYMMDD"] },
      {
        table: "deletedRecurringOccurrences",
        fields: ["deletedDateYYYYMMDD"],
      },
      {
        table: "deletedRecurringEventOccurrences",
        fields: ["deletedDateYYYYMMDD"],
      },
    ];

    // Loose check: any string that contains a `-` and starts with 4
    // digits gets the dashes stripped. This skips already-correct
    // `YYYYMMDD` values (no `-`) and the `"false"` sentinel that the
    // tasks extractor occasionally emits for `dateCompleted`.
    const stripDashes = (val: unknown): string | null => {
      if (typeof val !== "string") return null;
      if (!val.includes("-")) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return null;
      return val.replace(/-/g, "");
    };

    const results: { table: string; field: string; patched: number }[] = [];
    for (const { table, fields } of targets) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rows = await ctx.db.query(table as any).collect();
      const counts: Record<string, number> = Object.fromEntries(
        fields.map((f) => [f, 0]),
      );
      for (const row of rows) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const update: Record<string, any> = {};
        for (const field of fields) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fixed = stripDashes((row as any)[field]);
          if (fixed !== null) {
            update[field] = fixed;
            counts[field]++;
          }
        }
        if (Object.keys(update).length > 0) {
          await ctx.db.patch(row._id, update);
        }
      }
      for (const field of fields) {
        results.push({ table, field, patched: counts[field] });
      }
    }
    return results;
  },
});

/**
 * Diagnostics endpoint used by the loader script to figure out which legacy
 * IDs are already present in a given table, so it can decide what to send
 * in the next batch. Returns the set of `legacyId` strings that already
 * have a row in the named table.
 */
export const findExistingLegacyIds = internalMutation({
  args: {
    table: v.string(),
    legacyIds: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<string[]> => {
    const found: string[] = [];
    for (const legacyId of args.legacyIds) {
      const existing = await ctx.db
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .query(args.table as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .withIndex("by_legacy" as any, (q: any) => q.eq("legacyId", legacyId))
        .unique();
      if (existing) found.push(legacyId);
    }
    return found;
  },
});
