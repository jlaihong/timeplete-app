import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();

  if (!user) {
    throw new Error("User not found in database");
  }

  return user;
}

export async function getCurrentUserOrNull(
  ctx: QueryCtx | MutationCtx
): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("users")
    .withIndex("by_token", (q) =>
      q.eq("tokenIdentifier", identity.tokenIdentifier)
    )
    .unique();
}

/**
 * Same approval rules as {@link requireApprovedUser}, but returns `null`
 * when there is no Convex `users` row yet (session bootstrap after refresh).
 * Read queries should use this and return empty payloads instead of throwing,
 * so navigators can stay mounted while `users.store` runs.
 */
export async function requireApprovedUserOrEmpty(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users"> | null> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) return null;
  if (!user.isApproved) {
    throw new Error("Account pending approval");
  }
  return user;
}

export async function requireApprovedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<"users">> {
  const user = await requireApprovedUserOrEmpty(ctx);
  if (!user) {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    throw new Error("User not found in database");
  }
  return user;
}
