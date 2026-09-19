import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { persistBoundedOrderMove } from "./_helpers/orderShift";
import { verifyListWriteAccess } from "./_helpers/permissions";

export const search = query({
  args: { listId: v.optional(v.id("lists")) },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    if (args.listId) {
      return await ctx.db
        .query("listSections")
        .withIndex("by_list", (q) => q.eq("listId", args.listId!))
        .collect();
    }
    return await ctx.db
      .query("listSections")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("listSections")),
    listId: v.id("lists"),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await verifyListWriteAccess(ctx, args.listId, user._id);

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing) throw new Error("Section not found");
      await ctx.db.patch(args.id, { name: args.name });
      return args.id;
    }

    const sections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", args.listId))
      .collect();
    const maxOrder = sections.length > 0
      ? Math.max(...sections.map((s) => s.orderIndex))
      : -1;

    return await ctx.db.insert("listSections", {
      listId: args.listId,
      name: args.name,
      orderIndex: maxOrder + 1,
      isDefaultSection: false,
      userId: user._id,
    });
  },
});

export const move = mutation({
  args: {
    id: v.id("listSections"),
    toIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const section = await ctx.db.get(args.id);
    if (!section) throw new Error("Section not found");
    await verifyListWriteAccess(ctx, section.listId, user._id);

    const allSections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", section.listId))
      .collect();

    await persistBoundedOrderMove(ctx, allSections, args.id, args.toIndex);
  },
});

export const remove = mutation({
  args: { id: v.id("listSections"), listId: v.id("lists") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    await verifyListWriteAccess(ctx, args.listId, user._id);
    const section = await ctx.db.get(args.id);
    if (!section) throw new Error("Section not found");
    await ctx.db.delete(args.id);
  },
});
