/**
 * Repair denormalized trackable lifetime totals when task-window snapshots
 * drift from current task attribution (e.g. task moved to another trackable
 * but an old `timeWindows.trackableId` snapshot still credits the old row).
 *
 * Run order:
 *   1. `resyncTaskWindowSnapshots:runAll`
 *   2. `recomputeFromCoalesce:runAll`
 */
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import {
  buildListIdToTrackableId,
  resolveAttributedTrackableId,
  resolveSnapshotTrackableIdForTask,
  type TaskInfo,
} from "../_helpers/trackableAttribution";

type UserLinkCache = Map<string, Map<string, Id<"trackables">>>;

async function linksForUser(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
  cache: UserLinkCache,
): Promise<Map<string, Id<"trackables">>> {
  let map = cache.get(userId);
  if (!map) {
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    map = buildListIdToTrackableId(links);
    cache.set(userId, map);
  }
  return map;
}

function taskInfoMap(
  taskId: Id<"tasks"> | undefined,
  info: TaskInfo | null,
): Map<string, TaskInfo> {
  const m = new Map<string, TaskInfo>();
  if (taskId && info) m.set(String(taskId), info);
  return m;
}

function coalesceTrackableId(
  w: Pick<Doc<"timeWindows">, "trackableId" | "taskId" | "listId">,
  taskInfo: TaskInfo | null,
  listMap: Map<string, Id<"trackables">>,
): Id<"trackables"> | undefined {
  return (
    resolveAttributedTrackableId(w, taskInfoMap(w.taskId, taskInfo), listMap) ??
    undefined
  );
}

async function expectedSnapshotForWindow(
  ctx: QueryCtx | MutationCtx,
  w: Doc<"timeWindows">,
  cache: UserLinkCache,
): Promise<Id<"trackables"> | undefined> {
  if (w.taskId) {
    const task = await ctx.db.get(w.taskId);
    if (!task) return undefined;
    const listMap = await linksForUser(ctx, task.userId, cache);
    return resolveSnapshotTrackableIdForTask({
      task: { trackableId: task.trackableId, listId: task.listId },
      listIdToTrackableId: listMap,
    });
  }
  if (w.listId) {
    const listMap = await linksForUser(ctx, w.userId, cache);
    return listMap.get(w.listId) ?? undefined;
  }
  return w.trackableId;
}

/** Find ACTUAL windows whose snapshot no longer matches current task attribution. */
export const auditStaleSnapshots = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    const cache: UserLinkCache = new Map();
    const windows = await ctx.db.query("timeWindows").collect();

    const stale: Array<{
      windowId: Id<"timeWindows">;
      taskId?: Id<"tasks">;
      snapshotTrackableId?: Id<"trackables">;
      expectedSnapshot?: Id<"trackables">;
      coalesceTrackableId?: Id<"trackables">;
      durationSeconds: number;
    }> = [];

    for (const w of windows) {
      if (w.budgetType !== "ACTUAL" || w.activityType !== "TASK" || !w.taskId) {
        continue;
      }
      const task = await ctx.db.get(w.taskId);
      if (!task) continue;
      const listMap = await linksForUser(ctx, task.userId, cache);
      const taskInfo: TaskInfo = {
        trackableId: task.trackableId ?? null,
        listId: task.listId ?? null,
      };
      const expected = resolveSnapshotTrackableIdForTask({
        task: taskInfo,
        listIdToTrackableId: listMap,
      });
      const coalesced = coalesceTrackableId(w, taskInfo, listMap);
      if (w.trackableId === expected) continue;
      stale.push({
        windowId: w._id,
        taskId: w.taskId,
        snapshotTrackableId: w.trackableId,
        expectedSnapshot: expected,
        coalesceTrackableId: coalesced,
        durationSeconds: w.durationSeconds ?? 0,
      });
      if (stale.length >= limit) break;
    }

    return { staleCount: stale.length, stale };
  },
});

/** Trackables with lifetime time but no directly-assigned tasks. */
export const auditTrackablesWithoutTasks = internalQuery({
  args: { minSeconds: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const minSeconds = args.minSeconds ?? 60;
    const trackables = await ctx.db.query("trackables").collect();
    const out: Array<{
      trackableId: Id<"trackables">;
      name: string;
      lifetimeTotalSeconds: number;
      snapshotWindowSeconds: number;
      directTaskCount: number;
      listLinkedTaskCount: number;
    }> = [];

    for (const t of trackables) {
      const lifetime = t.lifetimeTotalSeconds ?? 0;
      if (lifetime < minSeconds) continue;

      const directTasks = await ctx.db
        .query("tasks")
        .withIndex("by_user", (q) => q.eq("userId", t.userId))
        .collect();
      const directCount = directTasks.filter(
        (task) => task.trackableId === t._id,
      ).length;

      const listLinks = await ctx.db
        .query("listTrackableLinks")
        .withIndex("by_trackable", (q) => q.eq("trackableId", t._id))
        .collect();
      let listTaskCount = 0;
      for (const link of listLinks) {
        const listTasks = await ctx.db
          .query("tasks")
          .withIndex("by_list", (q) => q.eq("listId", link.listId))
          .collect();
        listTaskCount += listTasks.length;
      }

      const snapshotWindows = await ctx.db
        .query("timeWindows")
        .withIndex("by_trackable", (q) => q.eq("trackableId", t._id))
        .collect();
      const snapshotWindowSeconds = snapshotWindows
        .filter((w) => w.budgetType === "ACTUAL")
        .reduce((s, w) => s + (w.durationSeconds ?? 0), 0);

      if (directCount === 0) {
        out.push({
          trackableId: t._id,
          name: t.name,
          lifetimeTotalSeconds: lifetime,
          snapshotWindowSeconds,
          directTaskCount: directCount,
          listLinkedTaskCount: listTaskCount,
        });
      }
    }

    return { count: out.length, trackables: out };
  },
});

async function resyncBatch(
  ctx: MutationCtx,
  afterCreationTime: number,
  limit: number,
): Promise<{
  scanned: number;
  patched: number;
  done: boolean;
  nextAfter?: number;
}> {
  const cache: UserLinkCache = new Map();
  const batch = await ctx.db
    .query("timeWindows")
    .order("asc")
    .filter((q) => q.gt(q.field("_creationTime"), afterCreationTime))
    .take(limit + 1);

  const hasMore = batch.length > limit;
  const windows = hasMore ? batch.slice(0, limit) : batch;
  if (windows.length === 0) {
    return { scanned: 0, patched: 0, done: true };
  }

  let patched = 0;
  for (const w of windows) {
    if (w.budgetType !== "ACTUAL") continue;
    const expected = await expectedSnapshotForWindow(ctx, w, cache);
    if (w.trackableId === expected) continue;
    await ctx.db.patch(w._id, { trackableId: expected });
    patched++;
  }

  const last = windows[windows.length - 1];
  return {
    scanned: windows.length,
    patched,
    done: !hasMore,
    nextAfter: hasMore && last ? last._creationTime : undefined,
  };
}

/** Re-stamp every ACTUAL window snapshot from the current task/list link. */
export const resyncTaskWindowSnapshots = internalMutation({
  args: {
    afterCreationTime: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await resyncBatch(ctx, args.afterCreationTime ?? -1, args.limit ?? 500);
  },
});

export const resyncTaskWindowSnapshotsAll = internalMutation({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    let after = -1;
    let totalScanned = 0;
    let totalPatched = 0;
    for (let i = 0; i < 200; i++) {
      const result = await resyncBatch(ctx, after, limit);
      totalScanned += result.scanned;
      totalPatched += result.patched;
      if (result.done) {
        return { iterations: i + 1, scanned: totalScanned, patched: totalPatched };
      }
      after = result.nextAfter ?? after;
    }
    throw new Error("resyncTaskWindowSnapshotsAll exceeded batch limit");
  },
});

async function computeCoalesceTotals(
  ctx: QueryCtx | MutationCtx,
  trackable: Doc<"trackables">,
  cache: UserLinkCache,
  taskCache: Map<string, TaskInfo | null>,
): Promise<{
  lifetimeTotalSeconds: number;
  lifetimeCalendarCount: number;
  firstActivityDayYYYYMMDD: string | undefined;
}> {
  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_user", (q) => q.eq("userId", trackable.userId))
    .collect();

  let lifetimeCalendarSeconds = 0;
  let lifetimeCalendarCount = 0;
  let firstActivity: string | undefined;

  const listMap = await linksForUser(ctx, trackable.userId, cache);

  for (const w of windows) {
    if (w.budgetType !== "ACTUAL") continue;
    let taskInfo: TaskInfo | null = null;
    if (w.taskId) {
      const key = String(w.taskId);
      if (!taskCache.has(key)) {
        const task = await ctx.db.get(w.taskId);
        taskCache.set(
          key,
          task
            ? {
                trackableId: task.trackableId ?? null,
                listId: task.listId ?? null,
              }
            : null,
        );
      }
      taskInfo = taskCache.get(key) ?? null;
    }
    const attributed = coalesceTrackableId(w, taskInfo, listMap);
    if (attributed !== trackable._id) continue;
    lifetimeCalendarSeconds += w.durationSeconds ?? 0;
    lifetimeCalendarCount += 1;
    const day = w.startDayYYYYMMDD;
    if (day && (!firstActivity || day < firstActivity)) {
      firstActivity = day;
    }
  }

  const isTracker = trackable.trackableType === "TRACKER";
  let trackerSeconds = 0;
  if (isTracker) {
    const entries = await ctx.db
      .query("trackerEntries")
      .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
      .collect();
    for (const e of entries) {
      trackerSeconds += e.durationSeconds ?? 0;
      const day = e.dayYYYYMMDD;
      if (day && (!firstActivity || day < firstActivity)) {
        firstActivity = day;
      }
    }
  }

  return {
    lifetimeTotalSeconds:
      lifetimeCalendarSeconds + (isTracker ? trackerSeconds : 0),
    lifetimeCalendarCount,
    firstActivityDayYYYYMMDD: firstActivity,
  };
}

export const repairAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const limit = 500;
    let after = -1;
    let resyncScanned = 0;
    let resyncPatched = 0;
    for (let i = 0; i < 200; i++) {
      const result = await resyncBatch(ctx, after, limit);
      resyncScanned += result.scanned;
      resyncPatched += result.patched;
      if (result.done) break;
      after = result.nextAfter ?? after;
    }

    const trackables = await ctx.db.query("trackables").collect();
    const byUser = new Map<string, Doc<"trackables">[]>();
    for (const t of trackables) {
      const key = String(t.userId);
      const bucket = byUser.get(key);
      if (bucket) bucket.push(t);
      else byUser.set(key, [t]);
    }

    const cache: UserLinkCache = new Map();
    const taskCache = new Map<string, TaskInfo | null>();
    let lifetimePatched = 0;

    for (const [, userTrackables] of byUser) {
      for (const trackable of userTrackables) {
        const next = await computeCoalesceTotals(
          ctx,
          trackable,
          cache,
          taskCache,
        );

        const trackableDays = await ctx.db
          .query("trackableDays")
          .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
          .collect();
        let lifetimeStoredDayCount = 0;
        for (const d of trackableDays) {
          lifetimeStoredDayCount += d.numCompleted ?? 0;
        }

        const entries = await ctx.db
          .query("trackerEntries")
          .withIndex("by_trackable", (q) => q.eq("trackableId", trackable._id))
          .collect();
        let lifetimeTrackerEntryCount = 0;
        let lifetimeTrackerEntrySeconds = 0;
        for (const e of entries) {
          lifetimeTrackerEntryCount += e.countValue ?? 0;
          lifetimeTrackerEntrySeconds += e.durationSeconds ?? 0;
        }

        const patch = {
          lifetimeTotalSeconds: next.lifetimeTotalSeconds,
          lifetimeCalendarCount: next.lifetimeCalendarCount,
          lifetimeStoredDayCount,
          lifetimeTrackerEntryCount,
          lifetimeTrackerEntrySeconds,
          lifetimeTrackerEntryRowCount: entries.length,
          firstActivityDayYYYYMMDD: next.firstActivityDayYYYYMMDD,
        };

        const changed =
          (trackable.lifetimeTotalSeconds ?? 0) !== patch.lifetimeTotalSeconds ||
          (trackable.lifetimeCalendarCount ?? 0) !== patch.lifetimeCalendarCount ||
          (trackable.lifetimeStoredDayCount ?? 0) !== patch.lifetimeStoredDayCount ||
          (trackable.lifetimeTrackerEntryCount ?? 0) !==
            patch.lifetimeTrackerEntryCount ||
          (trackable.lifetimeTrackerEntrySeconds ?? 0) !==
            patch.lifetimeTrackerEntrySeconds ||
          (trackable.lifetimeTrackerEntryRowCount ?? 0) !==
            patch.lifetimeTrackerEntryRowCount ||
          trackable.firstActivityDayYYYYMMDD !== patch.firstActivityDayYYYYMMDD;

        if (!changed) continue;
        await ctx.db.patch(trackable._id, patch);
        lifetimePatched++;
      }
    }

    return {
      resyncScanned,
      resyncPatched,
      lifetimePatched,
      totalTrackables: trackables.length,
    };
  },
});
