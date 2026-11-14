import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import {
  flattenMentions,
  mentionedPageIds,
  refreshMentionNames,
} from "../../lib/mentions";
import { toCompactYYYYMMDD } from "./compactYYYYMMDD";

export type MentionSourceType = Doc<"mentions">["sourceType"];

/**
 * Every kind of text that can hold mentions: which table it lives in,
 * which of its fields are free text, and the day it is about (used to
 * order a page's "mentioned in" list).
 *
 * To let a new kind of text hold mentions: add it here and to the
 * `mentions.sourceType` union in the schema, call `syncSourceMentions`
 * where it is saved, and describe it in `pages.backlinks`.
 */
const SOURCES: Record<
  MentionSourceType,
  {
    table: TableNames;
    fields: string[];
    day: (doc: Record<string, unknown>) => string | undefined;
  }
> = {
  reviewAnswer: {
    table: "reviewAnswers",
    fields: ["answerText"],
    day: (d) => d.dayUnderReview as string,
  },
  task: {
    table: "tasks",
    fields: ["name"],
    day: (d) => d.taskDay as string | undefined,
  },
  timeWindow: {
    table: "timeWindows",
    fields: ["title", "comments"],
    day: (d) => d.startDayYYYYMMDD as string,
  },
  taskComment: {
    table: "taskComments",
    fields: ["commentText"],
    day: () => undefined,
  },
  trackerEntry: {
    table: "trackerEntries",
    fields: ["comments"],
    day: (d) => d.dayYYYYMMDD as string,
  },
  trackableDay: {
    table: "trackableDays",
    fields: ["comments"],
    day: (d) => d.dayYYYYMMDD as string,
  },
  page: {
    table: "pages",
    fields: ["notes"],
    day: () => undefined,
  },
};

function dayOfCreation(creationTime: number): string {
  return new Date(creationTime).toISOString().slice(0, 10).replace(/-/g, "");
}

export interface MentionSource {
  id: string;
  userId: Id<"users">;
  /** YYYYMMDD the text is about; the day it was written if it has none. */
  day: string;
  /** The free-text fields that have a value. */
  texts: Record<string, string>;
  doc: Record<string, unknown>;
}

/** The row a mention points at, or `null` if it is gone. */
export async function loadMentionSource(
  ctx: QueryCtx | MutationCtx,
  sourceType: MentionSourceType,
  sourceId: string,
): Promise<MentionSource | null> {
  const source = SOURCES[sourceType];
  const id = ctx.db.normalizeId(source.table, sourceId);
  const doc = id
    ? ((await ctx.db.get(id)) as Record<string, unknown> | null)
    : null;
  if (!doc) return null;
  const texts: Record<string, string> = {};
  for (const field of source.fields) {
    const value = doc[field];
    if (typeof value === "string" && value !== "") texts[field] = value;
  }
  return {
    id: doc._id as string,
    userId: doc.userId as Id<"users">,
    day:
      toCompactYYYYMMDD(source.day(doc)) ||
      dayOfCreation(doc._creationTime as number),
    texts,
    doc,
  };
}

async function patchSourceTexts(
  ctx: MutationCtx,
  sourceType: MentionSourceType,
  source: MentionSource,
  next: Record<string, string>,
): Promise<void> {
  const patch: Record<string, string> = {};
  for (const [field, text] of Object.entries(next)) {
    if (text !== source.texts[field]) patch[field] = text;
  }
  if (Object.keys(patch).length === 0) return;
  // The table is chosen at run time, so the patch cannot be typed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await ctx.db.patch(source.doc._id as any, patch as any);
  void sourceType;
}

/**
 * Call after a text that may hold mentions has been saved. Brings the
 * `mentions` index in line with the row, and tidies the row's text: each
 * link carries its page's current name, and a link to a page that no
 * longer exists becomes plain words.
 *
 * A link may point at someone else's page: on a shared list, one member's
 * mention stays a link for everyone, whoever edits the text next. Only
 * the page's owner can open it; the index row belongs to them.
 *
 * `isNew` skips all of it for a freshly inserted row with no link in it,
 * which is nearly every row.
 */
export async function syncSourceMentions(
  ctx: MutationCtx,
  sourceType: MentionSourceType,
  sourceId: string,
  opts: { isNew?: boolean } = {},
): Promise<void> {
  const source = await loadMentionSource(ctx, sourceType, sourceId);
  if (!source) return;
  const texts = Object.values(source.texts);
  const hasLinks = texts.some((t) => t.includes("@["));
  if (opts.isNew && !hasLinks) return;

  const names = new Map<string, string>();
  const owners = new Map<string, Id<"users">>();
  const gone = new Set<string>();
  if (hasLinks) {
    for (const rawId of new Set(texts.flatMap((t) => mentionedPageIds(t)))) {
      const pageId = ctx.db.normalizeId("pages", rawId);
      const page = pageId ? await ctx.db.get(pageId) : null;
      if (page) {
        names.set(rawId, page.name);
        owners.set(rawId, page.userId);
      } else {
        gone.add(rawId);
      }
    }
    const next: Record<string, string> = {};
    for (const [field, original] of Object.entries(source.texts)) {
      let text = original;
      for (const rawId of gone) text = flattenMentions(text, rawId);
      next[field] = refreshMentionNames(text, (id) => names.get(id));
    }
    await patchSourceTexts(ctx, sourceType, source, next);
  }

  const existing = await ctx.db
    .query("mentions")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", sourceType).eq("sourceId", source.id),
    )
    .take(500);
  const kept = new Set<string>();
  for (const row of existing) {
    if (!names.has(row.pageId) || kept.has(row.pageId)) {
      await ctx.db.delete(row._id);
      continue;
    }
    kept.add(row.pageId);
    if (row.day !== source.day) await ctx.db.patch(row._id, { day: source.day });
  }
  for (const rawId of names.keys()) {
    if (kept.has(rawId)) continue;
    await ctx.db.insert("mentions", {
      userId: owners.get(rawId) ?? source.userId,
      pageId: rawId as Id<"pages">,
      sourceType,
      sourceId: source.id,
      day: source.day,
    });
  }
}

/** Call when the row holding a text is deleted. */
export async function removeMentionsForSource(
  ctx: MutationCtx,
  sourceType: MentionSourceType,
  sourceId: string,
): Promise<void> {
  const rows = await ctx.db
    .query("mentions")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", sourceType).eq("sourceId", sourceId),
    )
    .take(500);
  for (const row of rows) await ctx.db.delete(row._id);
}

/**
 * Rewrite the text a mention row points at. Returns `false` when the row
 * is gone, so the caller can drop the stale index entry.
 */
export async function rewriteMentionSource(
  ctx: MutationCtx,
  mention: Doc<"mentions">,
  rewrite: (text: string) => string,
): Promise<boolean> {
  const source = await loadMentionSource(
    ctx,
    mention.sourceType,
    mention.sourceId,
  );
  if (!source) return false;
  const next: Record<string, string> = {};
  for (const [field, text] of Object.entries(source.texts)) {
    next[field] = rewrite(text);
  }
  await patchSourceTexts(ctx, mention.sourceType, source, next);
  return true;
}
