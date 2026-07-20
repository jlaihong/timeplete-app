import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireApprovedUserOrEmpty } from "./_helpers/auth";

export const getTimeBreakdown = query({
  args: {
    startDay: v.string(),
    endDay: v.string(),
    collaboratorIds: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) {
      return {
        timeWindows: [],
        tasks: {},
        tags: {},
        lists: {},
        trackables: {},
        listIdToTrackableId: {},
        windowStart: args.startDay,
        windowEnd: args.endDay,
      };
    }

    // Bounded read strategy (see convex-bandwidth-fixes branch notes):
    //
    // The historical implementation `.collect()`-ed every timeWindow,
    // task, tag, list, and trackable for the user and returned the
    // whole-collection maps to the client just so the UI could do
    // `tasks[w.taskId]` lookups. For a daily window that's a ~1.3 MB
    // read amplification (measured) per Analytics page load.
    //
    // The new approach:
    //   1. `timeWindows` is bounded by `by_user_day` to [startDay, endDay].
    //   2. We collect the ID sets actually referenced by those bounded
    //      windows (taskId / trackableId / listId / tagId) plus the
    //      `task.listId` of each referenced task (needed for the
    //      colour ladder + list grouping), and `ctx.db.get` only those
    //      entries.
    //   3. `listTrackableLinks` is small and required by the union
    //      attribution rule, so we keep the full per-user fetch.
    //
    // Consumers (`useAnalyticsDataset`, `grouping.ts`,
    // `editDialogAttributedHistory.ts`) only ever look entries up by
    // id — they never iterate the full maps for unrelated rows — so
    // narrowing is a no-op for behaviour but a ~10x read reduction.
    const userIds = [user._id, ...(args.collaboratorIds ?? [])];
    type TimeWindowDoc = Doc<"timeWindows">;
    const allWindows: TimeWindowDoc[] = [];
    for (const uid of userIds) {
      const windows = await ctx.db
        .query("timeWindows")
        .withIndex("by_user_day", (q) =>
          q
            .eq("userId", uid)
            .gte("startDayYYYYMMDD", args.startDay)
            .lte("startDayYYYYMMDD", args.endDay)
        )
        .collect();
      // Include BOTH budget types — productivity-one parity. P1's
      // `/analytics/time-breakdown` returned every window in range, so
      // PLANNED (→ "BUDGETED") windows materialized for recurring tasks
      // scheduled on the calendar showed up in Time Breakdown / Time
      // Spend. Filtering to ACTUAL here made those recurring blocks
      // (e.g. daily workouts logged only by task completion, never a
      // timer) vanish from analytics entirely. #bugfix
      allWindows.push(...windows);
    }

    // Collect referenced ids from the bounded windows.
    const referencedTaskIds = new Set<Id<"tasks">>();
    const referencedTrackableIds = new Set<Id<"trackables">>();
    const referencedListIds = new Set<Id<"lists">>();
    const referencedTagIds = new Set<Id<"tags">>();
    for (const w of allWindows) {
      if (w.taskId) referencedTaskIds.add(w.taskId);
      if (w.trackableId) referencedTrackableIds.add(w.trackableId);
      if (w.listId) referencedListIds.add(w.listId);
      if (Array.isArray(w.tagIds)) {
        for (const t of w.tagIds) referencedTagIds.add(t);
      }
    }

    const taskDocs = await Promise.all(
      Array.from(referencedTaskIds).map((id) => ctx.db.get(id))
    );
    const taskMap = new Map<string, Doc<"tasks">>();
    for (const t of taskDocs) {
      if (!t) continue;
      taskMap.set(t._id, t);
      // The task's `listId` is needed by `grouping.ts` (`list` group)
      // and the colour ladder, even though no window directly references
      // it. Pull it into the list-fetch set.
      if (t.listId) referencedListIds.add(t.listId);
      // Tasks may also carry an explicit `trackableId` we need surfaced
      // for `resolveTrackableId` (`tasks[id].trackableId`). The trackable
      // doc may not be referenced by any window directly.
      if (t.trackableId) referencedTrackableIds.add(t.trackableId);
    }

    const [listDocs, trackableDocs, tagDocs] = await Promise.all([
      Promise.all(Array.from(referencedListIds).map((id) => ctx.db.get(id))),
      Promise.all(
        Array.from(referencedTrackableIds).map((id) => ctx.db.get(id))
      ),
      Promise.all(Array.from(referencedTagIds).map((id) => ctx.db.get(id))),
    ]);

    const listMap = new Map<string, Doc<"lists">>();
    for (const l of listDocs) if (l) listMap.set(l._id, l);
    const trackableMap = new Map<string, Doc<"trackables">>();
    for (const t of trackableDocs) if (t) trackableMap.set(t._id, t);
    const tagMap = new Map<string, Doc<"tags">>();
    for (const t of tagDocs) if (t) tagMap.set(t._id, t);

    // Surface the list→trackable join so the client can run the SAME union
    // attribution as `getGoalDetails` / `getProgressionStats`. Kept whole
    // because the per-user link set is typically tiny (≤ a few dozen).
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const listIdToTrackableId: Record<string, string> = {};
    for (const link of links) {
      listIdToTrackableId[link.listId] = link.trackableId;
    }

    return {
      timeWindows: allWindows,
      tasks: Object.fromEntries(taskMap),
      tags: Object.fromEntries(tagMap),
      lists: Object.fromEntries(listMap),
      trackables: Object.fromEntries(trackableMap),
      listIdToTrackableId,
      // Surface the window so the client can guard against stale data
      // when the user switches tab/date faster than the query resolves.
      windowStart: args.startDay,
      windowEnd: args.endDay,
    };
  },
});

// `getProgressionStats` was removed here: it had no client callers and
// its full-table `tasks` + `timeWindows` scans read >1.3 MB per execution.
// `trackables.getTrackableAnalyticsSeries` is the bounded, maintained
// replacement for per-trackable aggregation.
