/**
 * Tiny helpers used while iterating on the migration. Do NOT call these
 * outside of dev. Removed in Phase 6 along with the rest of `_admin/`.
 */
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

/**
 * Delete a single app `users` row by its sentinel `legacyId`. Used to undo
 * smoke-test rows like `legacyId="test-uuid-1"` without touching real data
 * or the Better Auth side. Leaves any orphan BA user/account behind; that
 * is harmless and easy to clean up later.
 */
export const deleteAppUserByLegacyId = internalMutation({
  args: { legacyId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("users")
      .withIndex("by_legacy", (q) => q.eq("legacyId", args.legacyId))
      .unique();
    if (!row) return { removed: 0 };
    await ctx.db.delete(row._id);
    return { removed: 1 };
  },
});
