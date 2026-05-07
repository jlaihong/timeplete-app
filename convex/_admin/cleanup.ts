/**
 * Tiny helpers used while iterating on the migration. Do NOT call these
 * outside of dev. Removed in Phase 6 along with the rest of `_admin/`.
 */
import { internalMutation, type MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";

async function listCountForDedupe(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<number> {
  return (
    await ctx.db
      .query("lists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()
  ).length;
}

async function deleteShellUserContentForDedupe(
  ctx: MutationCtx,
  userId: Id<"users">,
) {
  for (const row of await ctx.db
    .query("lists")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("reviewQuestions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
  for (const row of await ctx.db
    .query("pushTokens")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect()) {
    await ctx.db.delete(row._id);
  }
}

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

/**
 * After importing a DB from another Convex deployment, duplicate `users`
 * rows can share an email but have different `tokenIdentifier` values.
 * Keeps the row with the most lists, applies the newest duplicate’s
 * `tokenIdentifier` (current session), deletes the other duplicate(s).
 *
 *   npx convex run internal._admin.cleanup:mergeDuplicateUsersByEmail \
 *     '{"email":"jeremy.laihong@gmail.com"}'
 */
export const mergeDuplicateUsersByEmail = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const raw = args.email.trim();
    const lower = raw.toLowerCase();

    let rows: Doc<"users">[] = await ctx.db
      .query("users")
      .withIndex("by_email", (q) => q.eq("email", lower))
      .collect();
    if (rows.length === 0 && raw !== lower) {
      rows = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", raw))
        .collect();
    }

    if (rows.length < 2) {
      throw new Error(
        `Expected at least 2 users with email "${args.email}", found ${rows.length}.`,
      );
    }

    const scored = await Promise.all(
      rows.map(async (u) => ({
        user: u,
        lists: await listCountForDedupe(ctx, u._id),
      })),
    );

    scored.sort((a, b) => {
      if (b.lists !== a.lists) return b.lists - a.lists;
      return a.user._creationTime - b.user._creationTime;
    });

    const primary = scored[0]!.user;
    const shells = scored.slice(1).map((s) => s.user);

    const tokenDonor = shells.reduce((best, u) =>
      u._creationTime > best._creationTime ? u : best,
    );

    const deleted: Id<"users">[] = [];
    for (const shell of shells) {
      await deleteShellUserContentForDedupe(ctx, shell._id);
      await ctx.db.delete(shell._id);
      deleted.push(shell._id);
    }

    await ctx.db.patch(primary._id, {
      tokenIdentifier: tokenDonor.tokenIdentifier,
    });

    return {
      keptUserId: primary._id,
      deletedUserIds: deleted,
      tokenIdentifierApplied: tokenDonor.tokenIdentifier,
    };
  },
});

/**
 * After a snapshot reimport, some `users` rows can still carry the OLD
 * Convex-Auth-style `tokenIdentifier` (`http://127.0.0.1:3211|<id>`)
 * because the snapshot pre-dates the legacy:<uuid> patching pass. Such
 * rows can never be claimed by the better-auth migration adoption code
 * in `users.ts` (which only matches `legacy:` prefixed shells), so the
 * user can sign in to better-auth but ends up linked to a fresh empty
 * shell instead of their imported data.
 *
 * Rewrite any `tokenIdentifier` starting with `http://` to
 * `legacy:<legacyId>` so the next sign-in adopts the row.
 *
 * Invoke ad-hoc:
 *   npx convex run --no-push internal._admin.cleanup:relegacyHttpTokenIdentifiers
 */
export const relegacyHttpTokenIdentifiers = internalMutation({
  args: {},
  handler: async (ctx) => {
    const patched: Array<{ userId: Id<"users">; email: string; from: string; to: string }> = [];
    const skipped: Array<{ userId: Id<"users">; email: string; reason: string }> = [];

    for await (const u of ctx.db.query("users")) {
      const ti = u.tokenIdentifier ?? "";
      if (!ti.startsWith("http://") && !ti.startsWith("https://")) continue;
      const legacyId = u.legacyId;
      if (!legacyId || typeof legacyId !== "string" || legacyId.length === 0) {
        skipped.push({
          userId: u._id,
          email: u.email ?? "(no email)",
          reason: "no legacyId — cannot relegacy without losing identity",
        });
        continue;
      }
      const next = `legacy:${legacyId}`;
      await ctx.db.patch(u._id, { tokenIdentifier: next });
      patched.push({
        userId: u._id,
        email: u.email ?? "(no email)",
        from: ti,
        to: next,
      });
    }

    return { patched, skipped };
  },
});
