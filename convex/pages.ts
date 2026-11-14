import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import {
  loadMentionSource,
  removeMentionsForSource,
  rewriteMentionSource,
  syncSourceMentions,
} from "./_helpers/mentions";
import {
  flattenMentions,
  mentionedPageIds,
  mentionsToPlainText,
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
      /** What the text is, e.g. "Task" or the review question. */
      title: string;
      text: string;
      /** Review answers: which review to open. */
      frequency?: Doc<"reviewAnswers">["frequency"];
      /** Tasks and their comments: the list they are on. */
      listId?: Doc<"lists">["_id"];
      /** Page notes: the page they belong to. */
      pageId?: Doc<"pages">["_id"];
    }[] = [];
    for (const row of rows) {
      const source = await loadMentionSource(ctx, row.sourceType, row.sourceId);
      if (!source) continue;
      const text = Object.values(source.texts).join("\n");
      // The index can lag a text changed outside the usual save paths.
      if (!mentionedPageIds(text).includes(args.pageId)) continue;

      const entry = {
        mentionId: row._id,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        day: source.day,
        text,
      };
      switch (row.sourceType) {
        case "reviewAnswer": {
          const answer = source.doc as Doc<"reviewAnswers">;
          const question = await ctx.db.get(answer.reviewQuestionId);
          out.push({
            ...entry,
            title: question?.questionText ?? "Review",
            frequency: answer.frequency,
          });
          break;
        }
        case "task": {
          const task = source.doc as Doc<"tasks">;
          out.push({ ...entry, title: "Task", listId: task.listId });
          break;
        }
        case "timeWindow": {
          const window = source.doc as Doc<"timeWindows">;
          out.push({
            ...entry,
            title:
              window.activityType === "EVENT"
                ? `Event at ${window.startTimeHHMM}`
                : `Time entry at ${window.startTimeHHMM}`,
          });
          break;
        }
        case "taskComment": {
          const comment = source.doc as Doc<"taskComments">;
          const task = await ctx.db.get(comment.taskId);
          out.push({
            ...entry,
            title: task
              ? `Comment on ${mentionsToPlainText(task.name)}`
              : "Comment",
            listId: task?.listId,
          });
          break;
        }
        case "trackerEntry":
        case "trackableDay": {
          const trackableId = (
            source.doc as Doc<"trackerEntries"> | Doc<"trackableDays">
          ).trackableId;
          const trackable = await ctx.db.get(trackableId);
          out.push({ ...entry, title: trackable?.name ?? "Trackable" });
          break;
        }
        case "page": {
          const owner = source.doc as Doc<"pages">;
          out.push({
            ...entry,
            title: `Notes on ${owner.name}`,
            pageId: owner._id,
          });
          break;
        }
      }
    }
    out.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
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
    if (args.notes !== undefined) {
      await syncSourceMentions(ctx, "page", args.id);
    }

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
    await removeMentionsForSource(ctx, "page", args.id);
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
      const found = await rewriteMentionSource(ctx, mention, (text) =>
        refreshMentionNames(text, (id) =>
          id === args.pageId ? page.name : undefined,
        ),
      );
      if (!found) await ctx.db.delete(mention._id);
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
