import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";

export const search = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    return await ctx.db
      .query("tags")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("tags")),
    name: v.string(),
    colour: v.string(),
    archived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== user._id)
        throw new Error("Tag not found");
      await ctx.db.patch(args.id, {
        name: args.name,
        colour: args.colour,
        archived: args.archived ?? existing.archived,
      });
      return args.id;
    }

    const tags = await ctx.db
      .query("tags")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const maxOrder = tags.length > 0
      ? Math.max(...tags.map((t) => t.orderIndex))
      : -1;

    return await ctx.db.insert("tags", {
      name: args.name,
      colour: args.colour,
      orderIndex: maxOrder + 1,
      userId: user._id,
      archived: args.archived ?? false,
    });
  },
});

export const move = mutation({
  args: {
    id: v.id("tags"),
    newOrderIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tag = await ctx.db.get(args.id);
    if (!tag || tag.userId !== user._id) throw new Error("Tag not found");

    const allTags = await ctx.db
      .query("tags")
      .withIndex("by_user_order", (q) => q.eq("userId", user._id))
      .collect();

    const sorted = allTags.sort((a, b) => a.orderIndex - b.orderIndex);
    const without = sorted.filter((t) => t._id !== args.id);
    without.splice(args.newOrderIndex, 0, tag);

    for (let i = 0; i < without.length; i++) {
      if (without[i].orderIndex !== i) {
        await ctx.db.patch(without[i]._id, { orderIndex: i });
      }
    }
  },
});

export const remove = mutation({
  args: { id: v.id("tags") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const tag = await ctx.db.get(args.id);
    if (!tag || tag.userId !== user._id) throw new Error("Tag not found");

    const taskTags = await ctx.db
      .query("taskTags")
      .withIndex("by_tag", (q) => q.eq("tagId", args.id))
      .collect();
    for (const tt of taskTags) {
      await ctx.db.delete(tt._id);
    }

    await ctx.db.delete(args.id);
  },
});
