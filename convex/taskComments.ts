import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

export const search = query({
  args: {
    taskId: v.id("tasks"),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();

    comments.sort((a, b) => b._creationTime - a._creationTime);

    const offset = args.offset ?? 0;
    const limit = args.limit ?? 50;
    return comments.slice(offset, offset + limit);
  },
});

export const upsert = mutation({
  args: {
    id: v.optional(v.id("taskComments")),
    taskId: v.id("tasks"),
    commentText: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      await ctx.db.patch(args.id, { commentText: args.commentText });
      return args.id;
    }

    return await ctx.db.insert("taskComments", {
      taskId: args.taskId,
      userId: user._id,
      commentText: args.commentText,
    });
  },
});

export const remove = mutation({
  args: { id: v.id("taskComments") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const comment = await ctx.db.get(args.id);
    if (!comment) throw new Error("Comment not found");
    await ctx.db.delete(args.id);
  },
});
