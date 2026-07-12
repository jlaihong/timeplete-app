import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser } from "./_helpers/auth";

/**
 * Register (or re-own) an Expo push token for the signed-in user. Tokens
 * are unique per install; if another account previously registered the
 * same device, the row is re-pointed at the current user.
 */
export const register = mutation({
  args: {
    token: v.string(),
    platform: v.union(v.literal("ios"), v.literal("android")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const token = args.token.trim();
    if (token === "") throw new Error("Empty push token");

    const existing = await ctx.db
      .query("pushTokens")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first();
    if (existing) {
      if (existing.userId !== user._id || existing.platform !== args.platform) {
        await ctx.db.patch(existing._id, {
          userId: user._id,
          platform: args.platform,
        });
      }
      return null;
    }
    await ctx.db.insert("pushTokens", {
      userId: user._id,
      token,
      platform: args.platform,
    });
    return null;
  },
});
