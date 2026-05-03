import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireApprovedUser } from "./_helpers/auth";

/**
 * Set/clear the bidirectional link between a list and a trackable.
 *
 * Mirrors productivity-one's `list-dialog → "Linked Trackable"` semantics:
 * a list has at most one linked trackable, and a trackable has at most one
 * linked list. Whenever the link changes we keep `listTrackableLinks` and
 * `trackable.listId` in sync, and clear out any conflicting prior link so
 * we never end up with two lists fighting over the same trackable (or vice
 * versa).
 */
async function setListTrackableLink(
  ctx: MutationCtx,
  userId: Id<"users">,
  listId: Id<"lists">,
  newTrackableId: Id<"trackables"> | null,
): Promise<void> {
  const existingByList = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .unique();

  // No-op fast path: link already matches the requested state.
  if ((existingByList?.trackableId ?? null) === newTrackableId) return;

  if (existingByList) {
    const oldTrackable = await ctx.db.get(existingByList.trackableId);
    // Only clear the trackable's listId pointer if it was actually pointing
    // at *this* list (it could have been re-linked elsewhere already).
    if (oldTrackable && oldTrackable.userId === userId && oldTrackable.listId === listId) {
      await ctx.db.patch(existingByList.trackableId, { listId: undefined });
    }
    await ctx.db.delete(existingByList._id);
  }

  if (newTrackableId) {
    const newTrackable = await ctx.db.get(newTrackableId);
    if (!newTrackable || newTrackable.userId !== userId) {
      throw new Error("Trackable not found");
    }

    // Steal the trackable away from any list that currently owns it.
    const existingByTrackable = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_trackable", (q) => q.eq("trackableId", newTrackableId))
      .unique();
    if (existingByTrackable) {
      await ctx.db.delete(existingByTrackable._id);
    }

    await ctx.db.insert("listTrackableLinks", {
      listId,
      trackableId: newTrackableId,
      userId,
    });
    await ctx.db.patch(newTrackableId, { listId });
  }
}

export const search = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);

    const ownLists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const linkMap = new Map<string, string>();
    for (const link of links) {
      linkMap.set(link.listId, link.trackableId);
    }

    return ownLists
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((list) => ({
        ...list,
        trackableId: linkMap.get(list._id) ?? null,
      }));
  },
});

/**
 * Narrow inbox lookup (still deployed for backwards-compat with stale web
 * bundles that reference `api.lists.getInboxList`). Prefer `lists:search`
 * on the client when possible so one query powers drawer + inbox.
 */
export const getInboxList = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUser(ctx);

    const inboxRows = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .filter((q) => q.eq(q.field("isInbox"), true))
      .collect();

    const candidates = inboxRows.filter((l) => !l.archived);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.orderIndex - b.orderIndex);

    const list = candidates[0];

    const existingByList = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_list", (q) => q.eq("listId", list._id))
      .unique();

    return {
      ...list,
      trackableId: existingByList?.trackableId ?? null,
    };
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("lists")),
    name: v.string(),
    colour: v.string(),
    archived: v.optional(v.boolean()),
    showInSidebar: v.optional(v.boolean()),
    // null  = explicitly clear the linked trackable
    // undefined = leave the link untouched (used when callers don't
    //             render the picker, e.g. an `archive` toggle)
    trackableId: v.optional(v.union(v.id("trackables"), v.null())),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id)
        throw new Error("List not found");
      await ctx.db.patch(args.id, {
        name: args.name,
        colour: args.colour,
        archived: args.archived ?? existing.archived,
        showInSidebar: args.showInSidebar ?? existing.showInSidebar,
      });
      if (args.trackableId !== undefined) {
        await setListTrackableLink(ctx, user._id, args.id, args.trackableId);
      }
      return args.id;
    }

    const lists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const maxOrder = lists.length > 0
      ? Math.max(...lists.map((l) => l.orderIndex))
      : -1;

    const listId = await ctx.db.insert("lists", {
      name: args.name,
      colour: args.colour,
      orderIndex: maxOrder + 1,
      userId: user._id,
      archived: args.archived ?? false,
      isGoalList: false,
      showInSidebar: args.showInSidebar ?? true,
      isInbox: false,
    });

    await ctx.db.insert("listSections", {
      listId,
      name: "Default",
      orderIndex: 0,
      isDefaultSection: true,
      userId: user._id,
    });

    if (args.trackableId) {
      await setListTrackableLink(ctx, user._id, listId, args.trackableId);
    }

    return listId;
  },
});

export const move = mutation({
  args: { id: v.id("lists"), newOrderIndex: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.id);
    if (!list || list.userId !== user._id) throw new Error("List not found");

    const allLists = await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    const sorted = allLists.sort((a, b) => a.orderIndex - b.orderIndex);
    const without = sorted.filter((l) => l._id !== args.id);
    without.splice(args.newOrderIndex, 0, list);

    for (let i = 0; i < without.length; i++) {
      if (without[i].orderIndex !== i) {
        await ctx.db.patch(without[i]._id, { orderIndex: i });
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("lists") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.id);
    if (!list || list.userId !== user._id) throw new Error("List not found");
    if (list.isInbox) throw new Error("Cannot delete inbox list");

    const sections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", args.id))
      .collect();
    for (const section of sections) {
      await ctx.db.delete(section._id);
    }

    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_list", (q) => q.eq("listId", args.id))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }

    const shares = await ctx.db
      .query("listShares")
      .withIndex("by_list", (q) => q.eq("listId", args.id))
      .collect();
    for (const share of shares) {
      await ctx.db.delete(share._id);
    }

    const invites = await ctx.db
      .query("pendingListInvites")
      .withIndex("by_list", (q) => q.eq("listId", args.id))
      .collect();
    for (const invite of invites) {
      await ctx.db.delete(invite._id);
    }

    await ctx.db.delete(args.id);
  },
});

function isTaskCompletedForListView(t: Doc<"tasks">): boolean {
  return t.dateCompleted != null && t.dateCompleted !== "";
}

/** Matches productivity-one list section ordering (`list-page.store` / `task-group`). */
function compareTasksForListView(a: Doc<"tasks">, b: Doc<"tasks">): number {
  const aDone = isTaskCompletedForListView(a);
  const bDone = isTaskCompletedForListView(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  return a.sectionOrderIndex - b.sectionOrderIndex;
}

export const getPaginated = query({
  args: {
    listId: v.id("lists"),
    sectionLimit: v.optional(v.number()),
    taskLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const list = await ctx.db.get(args.listId);
    if (!list) throw new Error("List not found");

    const sections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    const allSectionsSorted = sections.sort(
      (a, b) => a.orderIndex - b.orderIndex,
    );
    const sortedSections = allSectionsSorted.slice(
      0,
      args.sectionLimit ?? 500,
    );

    const sectionIdSet = new Set(allSectionsSorted.map((s) => s._id));
    const canonicalDefault =
      allSectionsSorted.find((s) => s.isDefaultSection) ??
      allSectionsSorted[0];
    /** Where to show tasks with missing or foreign sectionIds (migration / bugs). */
    const orphanBucket =
      sortedSections.find((s) => s._id === canonicalDefault?._id) ??
      sortedSections[0];

    const allOnList = await ctx.db
      .query("tasks")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();

    /** Other lists show recurring instances; inbox omits them (matches P1 / home overdue semantics). */
    const eligible = list.isInbox
      ? allOnList.filter((t) => !t.isRecurringInstance)
      : allOnList;

    const taskTagsAll = await ctx.db
      .query("taskTags")
      .withIndex("by_task")
      .collect();
    const eligibleIds = new Set(eligible.map((t) => t._id));
    const tagMap = new Map<Id<"tasks">, Id<"tags">[]>();
    for (const tt of taskTagsAll) {
      if (!eligibleIds.has(tt.taskId)) continue;
      const prev = tagMap.get(tt.taskId) ?? [];
      prev.push(tt.tagId);
      tagMap.set(tt.taskId, prev);
    }
    const withTags = (t: (typeof eligible)[number]) => ({
      ...t,
      tagIds: tagMap.get(t._id) ?? [],
    });

    const result = [];
    /**
     * `taskLimit` caps incomplete rows only. Completed tasks always follow (P1 stacks them
     * last); slicing the combined array would hide every completion whenever incomplete
     * count exceeds the cap — especially bad for inbox with long-open tasks.
     */
    const taskLim = args.taskLimit ?? 2500;

    for (const section of sortedSections) {
      const tasksForSection = eligible.filter((t) => {
        const sid = t.sectionId;
        if (sid && sectionIdSet.has(sid)) {
          return sid === section._id;
        }
        if (!orphanBucket) return false;
        return section._id === orphanBucket._id;
      });

      const sorted = [...tasksForSection].sort(compareTasksForListView);
      const incomplete = sorted.filter((t) => !isTaskCompletedForListView(t));
      const complete = sorted.filter((t) => isTaskCompletedForListView(t));
      const pageTasks = [...incomplete.slice(0, taskLim), ...complete].map(
        withTags,
      );

      result.push({
        section,
        tasks: pageTasks,
        totalTasks: tasksForSection.length,
      });
    }

    return {
      list,
      sections: result,
      totalSections: sections.length,
    };
  },
});
