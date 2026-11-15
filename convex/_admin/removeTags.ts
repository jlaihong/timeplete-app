/**
 * One-shot cleanup for the removal of tags.
 *
 * Tags were superseded by pages, and the `tags` / `taskTags` tables are
 * gone from the schema. Deployments that existed before the removal
 * still hold their rows, plus a leftover `tagIds` field on tasks, time
 * windows and the two recurring-rule tables. This deletes all of it.
 *
 *   npx convex run _admin/removeTags:run
 *
 * Batched (one transaction per page) so a large table can't blow the
 * per-mutation limits, and idempotent — a second run changes nothing.
 * Once it has run on every deployment, delete the deprecated `tagIds`
 * validators from `schema.ts` and this file.
 */
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

const FIELD_TABLES = [
  "tasks",
  "timeWindows",
  "recurringTasks",
  "recurringEvents",
] as const;
type FieldTable = (typeof FIELD_TABLES)[number];

/** No longer in the schema, so they are addressed by name only. */
const REMOVED_TABLES = ["taskTags", "tags"] as const;

const BATCH = 500;

export const stripTagIdsBatch = internalMutation({
  args: { table: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (
    ctx,
    args,
  ): Promise<{ cursor: string; done: boolean; patched: number }> => {
    if (!(FIELD_TABLES as readonly string[]).includes(args.table)) {
      throw new Error(`Unexpected table ${args.table}`);
    }
    const page = await ctx.db
      .query(args.table as FieldTable)
      .paginate({ numItems: BATCH, cursor: args.cursor });
    let patched = 0;
    for (const row of page.page) {
      if (row.tagIds === undefined) continue;
      await ctx.db.patch(row._id, { tagIds: undefined });
      patched++;
    }
    return { cursor: page.continueCursor, done: page.isDone, patched };
  },
});

export const deleteRemovedTableBatch = internalMutation({
  args: { table: v.string() },
  handler: async (ctx, args): Promise<{ deleted: number; done: boolean }> => {
    if (!(REMOVED_TABLES as readonly string[]).includes(args.table)) {
      throw new Error(`Unexpected table ${args.table}`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await ctx.db.query(args.table as any).take(BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    return { deleted: rows.length, done: rows.length < BATCH };
  },
});

export const run = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, number>> => {
    const summary: Record<string, number> = {};

    for (const table of FIELD_TABLES) {
      let cursor: string | null = null;
      let total = 0;
      for (;;) {
        const res: { cursor: string; done: boolean; patched: number } =
          await ctx.runMutation(internal._admin.removeTags.stripTagIdsBatch, {
            table,
            cursor,
          });
        total += res.patched;
        if (res.done) break;
        cursor = res.cursor;
      }
      summary[`${table}.tagIds cleared`] = total;
    }

    for (const table of REMOVED_TABLES) {
      let total = 0;
      for (;;) {
        const res: { deleted: number; done: boolean } = await ctx.runMutation(
          internal._admin.removeTags.deleteRemovedTableBatch,
          { table },
        );
        total += res.deleted;
        if (res.done) break;
      }
      summary[`${table} rows deleted`] = total;
    }

    return summary;
  },
});
