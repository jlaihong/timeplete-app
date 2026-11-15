/**
 * Background re-sync of trackable credit.
 *
 * Tags, rules and the trackable tree decide what every task and time
 * window counts toward. When a rule or the tree changes, the rows it
 * affects are walked here in small batches and each one is brought back in
 * line by `syncTaskAttribution` / `syncWindowAttribution`. Those apply
 * only the difference from what the row was last credited for, so a batch
 * can be repeated, run twice, or overlap normal writes without miscounting.
 *
 * Scope: one list (after its rule changed), one page (after a "mentions
 * this page" rule changed: only the texts that mention it are walked), or
 * the user's whole history (after the tree changed, a trackable was
 * deleted, or as the one-off migration that stamps existing rows).
 */
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  syncTaskAttribution,
  syncWindowAttribution,
  type LegacyHints,
} from "./_helpers/trackableLifetime";
import { newMembershipCache } from "./_helpers/trackableMembership";

const USER_BATCH = 100;
/** Smaller: each task in a list scope also re-syncs its windows. */
const LIST_BATCH = 20;

const scopeArgs = {
  userId: v.id("users"),
  /** Only this list's tasks and windows. Omit for everything. */
  listId: v.optional(v.id("lists")),
  /**
   * The trackable `listId` was linked to before the change that started
   * this run; needed to find the old credit of rows that were never
   * stamped. `linked: false` means it had none.
   */
  listLinkBefore: v.optional(
    v.object({
      linked: v.boolean(),
      trackableId: v.optional(v.id("trackables")),
    }),
  ),
};

/** Start a re-sync. Call from any mutation that changes rules or the tree. */
export async function scheduleTrackableResync(
  ctx: MutationCtx,
  args: {
    userId: Id<"users">;
    listId?: Id<"lists">;
    listLinkBefore?: Id<"trackables"> | null;
  },
): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.trackableResync.run, {
    userId: args.userId,
    listId: args.listId,
    listLinkBefore:
      args.listId && args.listLinkBefore !== undefined
        ? {
            linked: args.listLinkBefore !== null,
            trackableId: args.listLinkBefore ?? undefined,
          }
        : undefined,
    phase: "tasks",
    cursor: null,
  });
}

/**
 * Re-sync the tasks and events that mention `pageId`. Uses the `mentions`
 * index, so the cost is the number of mentions, not the user's history.
 */
export const runForPage = internalMutation({
  args: {
    userId: v.id("users"),
    pageId: v.id("pages"),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const cache = newMembershipCache();
    const result = await ctx.db
      .query("mentions")
      .withIndex("by_page_day", (q) => q.eq("pageId", args.pageId))
      .paginate({ numItems: LIST_BATCH, cursor: args.cursor });
    for (const mention of result.page) {
      if (mention.sourceType === "task") {
        const id = ctx.db.normalizeId("tasks", mention.sourceId);
        const task = id ? await ctx.db.get(id) : null;
        if (task && task.userId === args.userId) {
          await syncTaskAttribution(ctx, task._id, task, { cache });
        }
      } else if (mention.sourceType === "timeWindow") {
        const id = ctx.db.normalizeId("timeWindows", mention.sourceId);
        const tw = id ? await ctx.db.get(id) : null;
        if (tw && tw.userId === args.userId) {
          await syncWindowAttribution(ctx, tw._id, tw, { cache });
        }
      }
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.trackableResync.runForPage, {
        userId: args.userId,
        pageId: args.pageId,
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

export const run = internalMutation({
  args: {
    ...scopeArgs,
    phase: v.union(v.literal("tasks"), v.literal("windows")),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const { userId, listId } = args;
    const cache = newMembershipCache();
    const legacy: LegacyHints | undefined =
      listId && args.listLinkBefore
        ? {
            listLinkBefore: {
              listId,
              trackableId: args.listLinkBefore.trackableId,
            },
          }
        : undefined;
    const paginationOpts = {
      numItems: listId ? LIST_BATCH : USER_BATCH,
      cursor: args.cursor,
    };

    let isDone: boolean;
    let continueCursor: string;
    if (args.phase === "tasks") {
      const result = listId
        ? await ctx.db
            .query("tasks")
            .withIndex("by_list", (q) => q.eq("listId", listId))
            .paginate(paginationOpts)
        : await ctx.db
            .query("tasks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(paginationOpts);
      for (const task of result.page) {
        if (task.userId !== userId) continue;
        await syncTaskAttribution(ctx, task._id, task, {
          cache,
          legacy,
          // Whole-history runs reach every window in the "windows" phase.
          skipWindows: !listId,
        });
      }
      ({ isDone, continueCursor } = result);
    } else {
      const result = listId
        ? await ctx.db
            .query("timeWindows")
            .withIndex("by_list", (q) => q.eq("listId", listId))
            .paginate(paginationOpts)
        : await ctx.db
            .query("timeWindows")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .paginate(paginationOpts);
      for (const tw of result.page) {
        if (tw.userId !== userId) continue;
        await syncWindowAttribution(ctx, tw._id, tw, { cache, legacy });
      }
      ({ isDone, continueCursor } = result);
    }

    const scope = {
      userId,
      listId,
      listLinkBefore: args.listLinkBefore,
    };
    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.trackableResync.run, {
        ...scope,
        phase: args.phase,
        cursor: continueCursor,
      });
    } else if (args.phase === "tasks") {
      await ctx.scheduler.runAfter(0, internal.trackableResync.run, {
        ...scope,
        phase: "windows",
        cursor: null,
      });
    }
    return null;
  },
});

/**
 * One-off migration: stamp every existing task and window for every user
 * (`npx convex run trackableResync:runForAllUsers`). Rows written before
 * the trackable tree existed carry no stamp; this records what they count
 * toward so later rule and tree changes move their credit exactly.
 */
export const runForAllUsers = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("users")
      .paginate({ numItems: 50, cursor: args.cursor ?? null });
    for (const user of result.page) {
      await scheduleTrackableResync(ctx, { userId: user._id });
    }
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.trackableResync.runForAllUsers, {
        cursor: result.continueCursor,
      });
    }
    return null;
  },
});

/**
 * One-off: fill in `trackableDaySeconds.eventCount` (how many windows make
 * up each day's seconds) for rows written before it existed, so "times
 * done" trackables can count events from before the setting too.
 * `npx convex run trackableResync:backfillEventCounts '{"userId": "..."}'`
 *
 * Two passes over one user: set every row's count to zero, then walk
 * their ACTUAL windows and add one per trackable each counts toward.
 * Run it when the user is not logging; a window saved between the passes
 * could be counted twice.
 */
export const backfillEventCounts = internalMutation({
  args: {
    userId: v.id("users"),
    phase: v.optional(v.union(v.literal("reset"), v.literal("count"))),
    cursor: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const phase = args.phase ?? "reset";
    const paginationOpts = { numItems: 200, cursor: args.cursor ?? null };
    let isDone: boolean;
    let continueCursor: string;
    if (phase === "reset") {
      const result = await ctx.db
        .query("trackableDaySeconds")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .paginate(paginationOpts);
      for (const row of result.page) {
        await ctx.db.patch(row._id, { eventCount: 0 });
      }
      ({ isDone, continueCursor } = result);
    } else {
      const result = await ctx.db
        .query("timeWindows")
        .withIndex("by_user_budget_day", (q) =>
          q.eq("userId", args.userId).eq("budgetType", "ACTUAL"),
        )
        .paginate(paginationOpts);
      for (const tw of result.page) {
        if ((tw.durationSeconds ?? 0) <= 0) continue;
        for (const trackableId of tw.attributedTrackableIds ?? []) {
          const row = await ctx.db
            .query("trackableDaySeconds")
            .withIndex("by_trackable_day", (q) =>
              q
                .eq("trackableId", trackableId)
                .eq("dayYYYYMMDD", tw.startDayYYYYMMDD),
            )
            .unique();
          if (row) {
            await ctx.db.patch(row._id, {
              eventCount: (row.eventCount ?? 0) + 1,
            });
          }
        }
      }
      ({ isDone, continueCursor } = result);
    }
    if (!isDone) {
      await ctx.scheduler.runAfter(
        0,
        internal.trackableResync.backfillEventCounts,
        { userId: args.userId, phase, cursor: continueCursor },
      );
    } else if (phase === "reset") {
      await ctx.scheduler.runAfter(
        0,
        internal.trackableResync.backfillEventCounts,
        { userId: args.userId, phase: "count", cursor: null },
      );
    }
    return null;
  },
});
