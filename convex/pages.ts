import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
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
import { MAX_PAGE_DEPTH, pageFitsUnder, placePage } from "../lib/pageTree";

const kindValidator = v.union(
  v.literal("person"),
  v.literal("place"),
  v.literal("other"),
);

/** Texts rewritten per run of a background job. */
const BATCH = 50;

/**
 * The page another one is about to be put under, checked: it is the
 * user's, it is neither the moved page nor anything below it, and the
 * tree stays within `MAX_PAGE_DEPTH` levels.
 * `movedId` is absent when the page does not exist yet.
 */
async function loadParent(
  ctx: MutationCtx,
  userId: Id<"users">,
  parentId: Id<"pages">,
  movedId?: Id<"pages">,
): Promise<Doc<"pages">> {
  const parent = await ctx.db.get(parentId);
  if (!parent || parent.userId !== userId) {
    throw new Error("The page to put it under was not found");
  }
  // 1 for a top-level parent.
  let parentLevel = 0;
  let at: Doc<"pages"> | null = parent;
  while (at && parentLevel < 50) {
    if (at._id === movedId) {
      throw new Error("A page cannot sit under itself");
    }
    parentLevel++;
    at = at.parentId ? await ctx.db.get(at.parentId) : null;
  }

  // Levels hanging below the moved page: they move with it.
  let levelsBelow = 0;
  let frontier: Id<"pages">[] = movedId ? [movedId] : [];
  while (frontier.length > 0 && levelsBelow <= MAX_PAGE_DEPTH) {
    const next: Id<"pages">[] = [];
    for (const id of frontier) {
      const children = await ctx.db
        .query("pages")
        .withIndex("by_parent", (q) => q.eq("parentId", id))
        .take(2000);
      for (const child of children) next.push(child._id);
    }
    if (next.length === 0) break;
    levelsBelow++;
    frontier = next;
  }
  if (!pageFitsUnder(parentLevel, levelsBelow)) {
    throw new Error(
      `Pages nest ${MAX_PAGE_DEPTH} levels deep at most. Move it higher up.`,
    );
  }
  return parent;
}

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
 * `parentId` places a new page under another; a page that already exists
 * stays where it is.
 */
export const create = mutation({
  args: {
    name: v.string(),
    kind: v.optional(kindValidator),
    parentId: v.optional(v.id("pages")),
  },
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

    const parent = args.parentId
      ? await loadParent(ctx, user._id, args.parentId)
      : null;
    return await ctx.db.insert("pages", {
      userId: user._id,
      name,
      kind: args.kind,
      parentId: parent?._id,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("pages"),
    name: v.optional(v.string()),
    kind: v.optional(kindValidator),
    notes: v.optional(v.string()),
    /** The page to put it under; `null` takes it back to the top level. */
    parentId: v.optional(v.union(v.id("pages"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const page = await ctx.db.get(args.id);
    if (!page || page.userId !== user._id) throw new Error("Page not found");

    const patch: Partial<Doc<"pages">> = {};
    if (args.parentId === null) {
      patch.parentId = undefined;
    } else if (args.parentId !== undefined && args.parentId !== page.parentId) {
      patch.parentId = (
        await loadParent(ctx, user._id, args.parentId, page._id)
      )._id;
    }
    // In a new place it has no hand-set position yet (`move` gives one).
    if (
      args.parentId !== undefined &&
      (args.parentId ?? undefined) !== page.parentId
    ) {
      patch.orderIndex = undefined;
    }
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
 * Put a page under `parentId` (`null`: the top level) at a chosen place
 * among the pages there: before `beforeId`, after `afterId`, or last.
 * With the parent it already has, this just rearranges.
 */
export const move = mutation({
  args: {
    id: v.id("pages"),
    parentId: v.union(v.id("pages"), v.null()),
    beforeId: v.optional(v.id("pages")),
    afterId: v.optional(v.id("pages")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const page = await ctx.db.get(args.id);
    if (!page || page.userId !== user._id) throw new Error("Page not found");

    const parent =
      args.parentId === null
        ? null
        : args.parentId === page.parentId
          ? await ctx.db.get(args.parentId)
          : await loadParent(ctx, user._id, args.parentId, page._id);
    if (args.parentId !== null && !parent) throw new Error("Page not found");

    const siblings = parent
      ? await ctx.db
          .query("pages")
          .withIndex("by_parent", (q) => q.eq("parentId", parent._id))
          .take(2000)
      : (
          await ctx.db
            .query("pages")
            .withIndex("by_user", (q) => q.eq("userId", user._id))
            .take(2000)
        ).filter((p) => p.parentId === undefined);
    const current = new Map(siblings.map((p) => [p._id as string, p]));

    for (const placed of placePage(siblings, page._id, args)) {
      if (placed._id === page._id) {
        await ctx.db.patch(page._id, {
          parentId: parent?._id,
          orderIndex: placed.orderIndex,
        });
      } else if (current.get(placed._id)?.orderIndex !== placed.orderIndex) {
        await ctx.db.patch(placed._id as Id<"pages">, {
          orderIndex: placed.orderIndex,
        });
      }
    }
    return null;
  },
});

/**
 * Delete a page. Texts that mention it keep the words but lose the link,
 * which a background job works through. Pages under it move up to where
 * it sat.
 */
export const remove = mutation({
  args: { id: v.id("pages") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const page = await ctx.db.get(args.id);
    if (!page || page.userId !== user._id) throw new Error("Page not found");
    await removeMentionsForSource(ctx, "page", args.id);
    // Trackables that counted mentions of this page stop doing so.
    const rules = await ctx.db
      .query("trackableRules")
      .withIndex("by_page", (q) => q.eq("pageId", args.id))
      .take(200);
    for (const rule of rules) await ctx.db.delete(rule._id);
    if (rules.length > 0) {
      await ctx.scheduler.runAfter(0, internal.trackableResync.run, {
        userId: user._id,
        phase: "tasks",
        cursor: null,
      });
    }
    const children = await ctx.db
      .query("pages")
      .withIndex("by_parent", (q) => q.eq("parentId", args.id))
      .take(2000);
    for (const child of children) {
      await ctx.db.patch(child._id, { parentId: page.parentId });
    }
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
