import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";

export const searchQuestions = query({
  args: {
    frequency: v.optional(
      v.union(
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY"),
        v.literal("YEARLY")
      )
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    if (args.frequency) {
      return await ctx.db
        .query("reviewQuestions")
        .withIndex("by_user_frequency", (q) =>
          q.eq("userId", user._id).eq("frequency", args.frequency!)
        )
        .collect();
    }

    return await ctx.db
      .query("reviewQuestions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const upsertQuestion = mutation({
  args: {
    id: v.optional(v.id("reviewQuestions")),
    questionText: v.string(),
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    if (args.id) {
      await ctx.db.patch(args.id, {
        questionText: args.questionText,
        frequency: args.frequency,
      });
      return args.id;
    }

    const existing = await ctx.db
      .query("reviewQuestions")
      .withIndex("by_user_frequency", (q) =>
        q.eq("userId", user._id).eq("frequency", args.frequency)
      )
      .collect();

    const maxOrder = existing.length > 0
      ? Math.max(...existing.map((q) => q.orderIndex))
      : -1;

    return await ctx.db.insert("reviewQuestions", {
      userId: user._id,
      questionText: args.questionText,
      frequency: args.frequency,
      orderIndex: maxOrder + 1,
      archived: false,
    });
  },
});

export const moveQuestion = mutation({
  args: { id: v.id("reviewQuestions"), newOrderIndex: v.number() },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const question = await ctx.db.get(args.id);
    if (!question) throw new Error("Question not found");

    const all = await ctx.db
      .query("reviewQuestions")
      .withIndex("by_user_frequency", (q) =>
        q.eq("userId", user._id).eq("frequency", question.frequency)
      )
      .collect();

    const sorted = all.sort((a, b) => a.orderIndex - b.orderIndex);
    const without = sorted.filter((q) => q._id !== args.id);
    without.splice(args.newOrderIndex, 0, question);

    for (let i = 0; i < without.length; i++) {
      if (without[i].orderIndex !== i) {
        await ctx.db.patch(without[i]._id, { orderIndex: i });
      }
    }
  },
});

export const archiveQuestion = mutation({
  args: { id: v.id("reviewQuestions") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const q = await ctx.db.get(args.id);
    if (!q) throw new Error("Question not found");
    await ctx.db.patch(args.id, { archived: !q.archived });
  },
});

export const removeQuestion = mutation({
  args: { id: v.id("reviewQuestions") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const answers = await ctx.db
      .query("reviewAnswers")
      .withIndex("by_question", (q) => q.eq("reviewQuestionId", args.id))
      .collect();
    for (const a of answers) await ctx.db.delete(a._id);
    await ctx.db.delete(args.id);
  },
});

export const searchAnswers = query({
  args: {
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    dayUnderReview: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    return await ctx.db
      .query("reviewAnswers")
      .withIndex("by_user_frequency_day", (q) =>
        q
          .eq("userId", user._id)
          .eq("frequency", args.frequency)
          .eq("dayUnderReview", args.dayUnderReview)
      )
      .collect();
  },
});

export const searchAnswersRange = query({
  args: {
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    const all = await ctx.db
      .query("reviewAnswers")
      .withIndex("by_user_frequency_day", (q) =>
        q.eq("userId", user._id).eq("frequency", args.frequency)
      )
      .collect();

    return all.filter(
      (a) =>
        a.dayUnderReview >= args.startDate && a.dayUnderReview <= args.endDate
    );
  },
});

export const bulkUpsertAnswers = mutation({
  args: {
    answers: v.array(
      v.object({
        reviewQuestionId: v.id("reviewQuestions"),
        answerText: v.string(),
        frequency: v.union(
          v.literal("DAILY"),
          v.literal("WEEKLY"),
          v.literal("MONTHLY"),
          v.literal("YEARLY")
        ),
        dayUnderReview: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    for (const answer of args.answers) {
      const existing = await ctx.db
        .query("reviewAnswers")
        .withIndex("by_user_frequency_day", (q) =>
          q
            .eq("userId", user._id)
            .eq("frequency", answer.frequency)
            .eq("dayUnderReview", answer.dayUnderReview)
        )
        .filter((q) =>
          q.eq(q.field("reviewQuestionId"), answer.reviewQuestionId)
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, { answerText: answer.answerText });
      } else {
        await ctx.db.insert("reviewAnswers", {
          reviewQuestionId: answer.reviewQuestionId,
          userId: user._id,
          answerText: answer.answerText,
          frequency: answer.frequency,
          dayUnderReview: answer.dayUnderReview,
        });
      }
    }
  },
});
