import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import {
  flattenMentions,
  mentionedPageIds,
  refreshMentionNames,
} from "../../lib/mentions";

export type MentionSourceType = Doc<"mentions">["sourceType"];

/**
 * Call when a text that may hold mentions is saved. Brings the `mentions`
 * index in line with the text and returns the text to store: each link
 * carries its page's current name, and a link to a page the user does not
 * own (or that is gone) is turned back into plain words.
 */
export async function syncMentions(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    sourceType: MentionSourceType;
    sourceId: string;
    text: string;
    day: string;
  },
): Promise<string> {
  let text = args.text;
  const names = new Map<string, string>();
  for (const rawId of mentionedPageIds(text)) {
    const pageId = ctx.db.normalizeId("pages", rawId);
    const page = pageId ? await ctx.db.get(pageId) : null;
    if (page && page.userId === args.userId) names.set(rawId, page.name);
    else text = flattenMentions(text, rawId);
  }
  text = refreshMentionNames(text, (id) => names.get(id));

  const existing = await ctx.db
    .query("mentions")
    .withIndex("by_source", (q) =>
      q.eq("sourceType", args.sourceType).eq("sourceId", args.sourceId),
    )
    .take(500);
  const kept = new Set<string>();
  for (const row of existing) {
    if (!names.has(row.pageId) || kept.has(row.pageId)) {
      await ctx.db.delete(row._id);
      continue;
    }
    kept.add(row.pageId);
    if (row.day !== args.day) await ctx.db.patch(row._id, { day: args.day });
  }
  for (const rawId of names.keys()) {
    if (kept.has(rawId)) continue;
    await ctx.db.insert("mentions", {
      userId: args.userId,
      pageId: rawId as Id<"pages">,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      day: args.day,
    });
  }
  return text;
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
 * Rewrite the text a mention row points at. Add a case here for each new
 * kind of text that can hold mentions.
 */
export async function rewriteMentionSource(
  ctx: MutationCtx,
  mention: Doc<"mentions">,
  rewrite: (text: string) => string,
): Promise<void> {
  switch (mention.sourceType) {
    case "reviewAnswer": {
      const id = ctx.db.normalizeId("reviewAnswers", mention.sourceId);
      const answer = id ? await ctx.db.get(id) : null;
      if (!answer) return;
      const next = rewrite(answer.answerText);
      if (next !== answer.answerText) {
        await ctx.db.patch(answer._id, { answerText: next });
      }
      return;
    }
  }
}
