import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentUser, getCurrentUserOrNull } from "./_helpers/auth";

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

    if (existing) return existing._id;

    const userId = await ctx.db.insert("users", {
      tokenIdentifier: identity.tokenIdentifier,
      name: identity.name ?? "Anonymous",
      email: identity.email ?? "",
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
