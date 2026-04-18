import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

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

export const upsert = mutation({
  args: {
    id: v.optional(v.id("lists")),
    name: v.string(),
    colour: v.string(),
    archived: v.optional(v.boolean()),
    showInSidebar: v.optional(v.boolean()),
    trackableId: v.optional(v.id("trackables")),
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
      await ctx.db.insert("listTrackableLinks", {
        listId,
        trackableId: args.trackableId,
        userId: user._id,
      });
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

    const sortedSections = sections
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .slice(0, args.sectionLimit ?? 20);

    const result = [];
    const taskLim = args.taskLimit ?? 50;

    for (const section of sortedSections) {
      const tasks = await ctx.db
        .query("tasks")
        .withIndex("by_section", (q) => q.eq("sectionId", section._id))
        .collect();

      const sorted = tasks
        .filter((t) => !t.isRecurringInstance)
        .sort((a, b) => a.sectionOrderIndex - b.sectionOrderIndex)
        .slice(0, taskLim);

      result.push({
        section,
        tasks: sorted,
        totalTasks: tasks.filter((t) => !t.isRecurringInstance).length,
      });
    }

    return {
      list,
      sections: result,
      totalSections: sections.length,
    };
  },
});
