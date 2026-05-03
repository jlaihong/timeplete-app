import { query, mutation, action, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "./_helpers/auth";

/**
 * productivity-backend `_create_inbox_list` inserts both `AppList` and a default
 * `ListSection`. Convex previously inserted only the inbox row, so
 * `lists.getPaginated` iterated zero sections and the Inbox screen stayed empty.
 *
 * Idempotent: safe on every login via `users.store`.
 */
async function ensureInboxSectionsForUser(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<void> {
  const lists = await ctx.db
    .query("lists")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();

  for (const list of lists) {
    if (!list.isInbox || list.archived) continue;
    const sections = await ctx.db
      .query("listSections")
      .withIndex("by_list", (q) => q.eq("listId", list._id))
      .collect();
    if (sections.length > 0) continue;
    await ctx.db.insert("listSections", {
      listId: list._id,
      name: "Default",
      orderIndex: 0,
      isDefaultSection: true,
      userId,
    });
  }
}

const DEFAULT_REVIEW_QUESTIONS = [
  { text: "What went well today?", frequency: "DAILY" as const },
  { text: "What could have gone better?", frequency: "DAILY" as const },
  { text: "What are you grateful for?", frequency: "DAILY" as const },
  { text: "What did you learn this week?", frequency: "WEEKLY" as const },
  { text: "What are your priorities for next week?", frequency: "WEEKLY" as const },
  { text: "What progress did you make this month?", frequency: "MONTHLY" as const },
  { text: "What are your goals for next month?", frequency: "MONTHLY" as const },
];

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .unique();

    if (existing) {
      await ensureInboxSectionsForUser(ctx, existing._id);
      return existing._id;
    }

    // Migration adoption: if a row was pre-created by the productivity-app
    // -> Convex migration (it has a `legacy:<uuid>` placeholder
    // tokenIdentifier and the user's real email), claim it on first login
    // by patching the tokenIdentifier to the real one. This wires the
    // migrated user to all their pre-imported data without creating a
    // duplicate `users` row, an extra Inbox list, or duplicate default
    // review questions.
    const email = identity.email ?? "";
    if (email) {
      const legacyMatch = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) =>
          q.and(
            q.neq(q.field("tokenIdentifier"), identity.tokenIdentifier),
            q.gte(q.field("tokenIdentifier"), "legacy:"),
            q.lt(q.field("tokenIdentifier"), "legacy:\uffff")
          )
        )
        .first();
      if (legacyMatch) {
        await ctx.db.patch(legacyMatch._id, {
          tokenIdentifier: identity.tokenIdentifier,
          name: identity.name ?? legacyMatch.name,
        });
        await ensureInboxSectionsForUser(ctx, legacyMatch._id);
        return legacyMatch._id;
      }
    }

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "Anonymous",
      email,
      isApproved: true,
    });

    await ctx.db.insert("lists", {
      name: "Inbox",
      colour: "#4A90D9",
      orderIndex: 0,
      userId,
      archived: false,
      isGoalList: false,
      showInSidebar: true,
      isInbox: true,
    });

    await ensureInboxSectionsForUser(ctx, userId);

    for (let i = 0; i < DEFAULT_REVIEW_QUESTIONS.length; i++) {
      const q = DEFAULT_REVIEW_QUESTIONS[i];
      await ctx.db.insert("reviewQuestions", {
        userId,
        questionText: q.text,
        frequency: q.frequency,
        orderIndex: i,
        archived: false,
      });
    }

    return userId;
  },
});

export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return null;
    return { name: user.name, email: user.email, isApproved: user.isApproved };
  },
});

export const checkApproval = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUserOrNull(ctx);
    if (!user) return { approved: false };
    return { approved: user.isApproved };
  },
});

export const updateProfile = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (args.name.length < 1 || args.name.length > 100) {
      throw new Error("Name must be between 1 and 100 characters");
    }
    await ctx.db.patch(user._id, { name: args.name });
    return { name: args.name };
  },
});

export const adminApprove = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    await ctx.db.patch(args.userId, { isApproved: true });
  },
});
