import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { rewriteMentionSource } from "./_helpers/mentions";
import {
  flattenMentions,
  refreshMentionNames,
  sanitizePageName,
} from "../lib/mentions";

const kindValidator = v.union(
  v.literal("person"),
  v.literal("place"),
  v.literal("other"),
);

/** Texts rewritten per run of a background job. */
const BATCH = 50;

/** Every page the user has. Small rows; the app keeps this list loaded. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];
    return await ctx.db
      .query("pages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(2000);
  },
});

export const get = query({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;
    const page = await ctx.db.get(args.id);
    return page && page.userId === user._id ? page : null;
  },
});

/** Where a page is mentioned, newest first. */
export const backlinks = query({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];
    const page = await ctx.db.get(args.pageId);
    if (!page || page.userId !== user._id) return [];

    const rows = await ctx.db
      .query("mentions")
      .withIndex("by_page_day", (q) => q.eq("pageId", args.pageId))
      .order("desc")
      .take(200);

    const out: {
      mentionId: Doc<"mentions">["_id"];
      sourceType: Doc<"mentions">["sourceType"];
      sourceId: string;
      day: string;
      /** What kind of text it is, e.g. the review question. */
      title: string;
      frequency?: Doc<"reviewAnswers">["frequency"];
      text: string;
    }[] = [];
    for (const row of rows) {
      if (row.sourceType === "reviewAnswer") {
        const answerId = ctx.db.normalizeId("reviewAnswers", row.sourceId);
        const answer = answerId ? await ctx.db.get(answerId) : null;
        if (!answer) continue;
        const question = await ctx.db.get(answer.reviewQuestionId);
        out.push({
          mentionId: row._id,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          day: row.day,
          title: question?.questionText ?? "Review",
          frequency: answer.frequency,
          text: answer.answerText,
        });
      }
    }
    return out;
  },
});

/**
 * Create a page, or return the one that already has this name (so typing
 * "@Wesley" and choosing "Create" twice does not make two Wesleys).
 */
export const create = mutation({
  args: { name: v.string(), kind: v.optional(kindValidator) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const name = sanitizePageName(args.name);
    if (!name) throw new Error("A page needs a name");

    const existing = await ctx.db
      .query("pages")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .take(2000);
    const same = existing.find(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (same) return same._id;

    return await ctx.db.insert("pages", {
      userId: user._id,
      name,
      kind: args.kind,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("pages"),
    name: v.optional(v.string()),
    kind: v.optional(kindValidator),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const page = await ctx.db.get(args.id);
    if (!page || page.userId !== user._id) throw new Error("Page not found");

    const patch: Partial<Doc<"pages">> = {};
    if (args.kind !== undefined) patch.kind = args.kind;
    if (args.notes !== undefined) patch.notes = args.notes;
    let renamed = false;
    if (args.name !== undefined) {
      const name = sanitizePageName(args.name);
      if (!name) throw new Error("A page needs a name");
      if (name !== page.name) {
        patch.name = name;
        renamed = true;
      }
    }
    await ctx.db.patch(args.id, patch);

    // Readers show the page's current name straight away. This catches up
    // the copy of the name stored inside every text that mentions it.
    if (renamed) {
      await ctx.scheduler.runAfter(0, internal.pages.refreshNamesBatch, {
        pageId: args.id,
        cursor: null,
      });
    }
    return null;
  },
});

/**
 * Delete a page. Texts that mention it keep the words but lose the link,
 * which a background job works through.
 */
export const remove = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const page = await ctx.db.get(args.id);
    if (!page || page.userId !== user._id) throw new Error("Page not found");
    await ctx.db.delete(args.id);
    await ctx.scheduler.runAfter(0, internal.pages.flattenBatch, {
      pageId: args.id,
      name: page.name,
    });
    return null;
  },
});

/** After a rename: write the new name into the texts that mention the page. */
export const refreshNamesBatch = internalMutation({
  args: { pageId: v.id("pages"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    // Deleted meanwhile: `flattenBatch` takes over.
    if (!page) return null;

    const result = await ctx.db
      .query("mentions")
      .withIndex("by_page_day", (q) => q.eq("pageId", args.pageId))
      .paginate({ numItems: BATCH, cursor: args.cursor });
    for (const mention of result.page) {
      await rewriteMentionSource(ctx, mention, (text) =>
        refreshMentionNames(text, (id) =>
          id === args.pageId ? page.name : undefined,
        ),
      );
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.pages.refreshNamesBatch, {
        pageId: args.pageId,
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

/** After a delete: turn links to the page into plain words, drop the index. */
export const flattenBatch = internalMutation({
  args: { pageId: v.id("pages"), name: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("mentions")
      .withIndex("by_page_day", (q) => q.eq("pageId", args.pageId))
      .take(BATCH);
    for (const mention of rows) {
      await rewriteMentionSource(ctx, mention, (text) =>
        flattenMentions(text, args.pageId, args.name),
      );
      await ctx.db.delete(mention._id);
    }
    if (rows.length === BATCH) {
      await ctx.scheduler.runAfter(0, internal.pages.flattenBatch, args);
    }
    return null;
  },
});
