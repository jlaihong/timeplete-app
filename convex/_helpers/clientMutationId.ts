import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Claim a clientMutationId inside the mutation transaction.
 * Returns false if this id was already applied (safe no-op replay).
 * Omitting the id always returns true (legacy callers).
 *
 * Insert-before-work is safe: if the mutation throws, Convex rolls back
 * the claim row with the rest of the transaction.
 */
export async function claimClientMutationId(
  ctx: MutationCtx,
  userId: Id<"users">,
  clientMutationId: string | undefined,
): Promise<boolean> {
  if (clientMutationId == null || clientMutationId === "") return true;

  const existing = await ctx.db
    .query("clientMutations")
    .withIndex("by_user_and_id", (q) =>
      q.eq("userId", userId).eq("clientMutationId", clientMutationId),
    )
    .unique();
  if (existing) return false;

  await ctx.db.insert("clientMutations", {
    userId,
    clientMutationId,
    createdAt: Date.now(),
  });
  return true;
}
