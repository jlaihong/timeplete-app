/**
 * Maintains `trackables.lifetime*` and `firstActivityDayYYYYMMDD` so the
 * home + analytics readers can serve all-time totals straight off the
 * trackable document. The previous implementation re-aggregated the
 * user's entire activity history on every reactive fire of
 * `getGoalDetails` / `getTrackableAnalyticsSeries`, which was the single
 * largest contributor to dashboard `Reads` bandwidth on the home page.
 *
 * Contract (after `_admin/backfillTrackableLifetime` has run):
 *
 *   trackable.lifetimeTotalSeconds
 *     === Σ timeWindows.durationSeconds
 *         WHERE timeWindows.trackableId === trackable._id
 *           AND timeWindows.budgetType   === "ACTUAL"
 *       + Σ trackerEntries.durationSeconds   (TRACKER trackables only)
 *         WHERE trackerEntries.trackableId === trackable._id
 *
 *   trackable.lifetimeCalendarCount
 *     === count of timeWindows rows above
 *
 *   trackable.lifetimeStoredDayCount
 *     === Σ trackableDays.numCompleted WHERE trackableId === trackable._id
 *
 *   trackable.lifetimeTrackerEntryCount
 *     === Σ trackerEntries.countValue           (TRACKER only)
 *
 *   trackable.lifetimeTrackerEntrySeconds
 *     === Σ trackerEntries.durationSeconds      (TRACKER only)
 *
 *   trackable.lifetimeTrackerEntryRowCount
 *     === count of trackerEntries rows
 *
 *   trackable.lifetimeAttributedTaskDayCount
 *     === count of completed tasks whose attribution
 *         (`task.trackableId` else `task.listId → listTrackableLinks`)
 *         resolves to this trackable. Maintained by
 *         `onTaskCompletionAttribution` from `tasks.upsert` whenever a
 *         task's `dateCompleted`, `trackableId`, or `listId` changes
 *         (or the resolved-via-list attribution changes shape).
 *
 *   trackable.firstActivityDayYYYYMMDD
 *     === min day across all attributed windows / days / entries; falls
 *         back to `startDayYYYYMMDD` when no activity recorded.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { buildListIdToTrackableId } from "./trackableAttribution";
import { isYYYYMMDDCompact, toCompactYYYYMMDD } from "./compactYYYYMMDD";

type LifetimePatch = {
  totalSeconds?: number;
  calendarCount?: number;
  storedDayCount?: number;
  trackerEntryCount?: number;
  trackerEntrySeconds?: number;
  trackerEntryRowCount?: number;
  attributedTaskDayCount?: number;
};

async function applyDelta(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  delta: LifetimePatch,
  activityDay?: string,
): Promise<void> {
  const t = await ctx.db.get(trackableId);
  if (!t) return;
  const patch: Record<string, unknown> = {};
  if (delta.totalSeconds !== undefined) {
    patch.lifetimeTotalSeconds = Math.max(
      0,
      (t.lifetimeTotalSeconds ?? 0) + delta.totalSeconds,
    );
  }
  if (delta.calendarCount !== undefined) {
    patch.lifetimeCalendarCount = Math.max(
      0,
      (t.lifetimeCalendarCount ?? 0) + delta.calendarCount,
    );
  }
  if (delta.storedDayCount !== undefined) {
    patch.lifetimeStoredDayCount = Math.max(
      0,
      (t.lifetimeStoredDayCount ?? 0) + delta.storedDayCount,
    );
  }
  if (delta.trackerEntryCount !== undefined) {
    patch.lifetimeTrackerEntryCount = Math.max(
      0,
      (t.lifetimeTrackerEntryCount ?? 0) + delta.trackerEntryCount,
    );
  }
  if (delta.trackerEntrySeconds !== undefined) {
    patch.lifetimeTrackerEntrySeconds = Math.max(
      0,
      (t.lifetimeTrackerEntrySeconds ?? 0) + delta.trackerEntrySeconds,
    );
  }
  if (delta.trackerEntryRowCount !== undefined) {
    patch.lifetimeTrackerEntryRowCount = Math.max(
      0,
      (t.lifetimeTrackerEntryRowCount ?? 0) + delta.trackerEntryRowCount,
    );
  }
  if (delta.attributedTaskDayCount !== undefined) {
    patch.lifetimeAttributedTaskDayCount = Math.max(
      0,
      (t.lifetimeAttributedTaskDayCount ?? 0) + delta.attributedTaskDayCount,
    );
  }
  if (activityDay) {
    const current = t.firstActivityDayYYYYMMDD;
    if (!current || activityDay < current) {
      patch.firstActivityDayYYYYMMDD = activityDay;
    }
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(trackableId, patch);
  }
}

/** Call after inserting an ACTUAL `timeWindows` row with a resolved `trackableId`. */
export async function onAttributedWindowInserted(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    durationSeconds: number;
    startDayYYYYMMDD: string;
  },
): Promise<void> {
  if (args.durationSeconds <= 0 && args.startDayYYYYMMDD === "") return;
  await applyDelta(
    ctx,
    args.trackableId,
    {
      totalSeconds: args.durationSeconds,
      calendarCount: 1,
    },
    args.startDayYYYYMMDD,
  );
}

/** Call after patching an ACTUAL `timeWindows` row. */
export async function onAttributedWindowPatched(
  ctx: MutationCtx,
  before: {
    trackableId?: Id<"trackables">;
    budgetType: "ACTUAL" | "BUDGETED";
    durationSeconds: number;
    startDayYYYYMMDD: string;
  },
  after: {
    trackableId?: Id<"trackables">;
    budgetType: "ACTUAL" | "BUDGETED";
    durationSeconds: number;
    startDayYYYYMMDD: string;
  },
): Promise<void> {
  const beforeCounts =
    before.budgetType === "ACTUAL" && before.trackableId !== undefined;
  const afterCounts =
    after.budgetType === "ACTUAL" && after.trackableId !== undefined;

  if (
    beforeCounts &&
    afterCounts &&
    before.trackableId === after.trackableId
  ) {
    // Same trackable — just adjust the delta. `calendarCount` is
    // unchanged because the row count didn't change.
    await applyDelta(
      ctx,
      after.trackableId as Id<"trackables">,
      { totalSeconds: after.durationSeconds - before.durationSeconds },
      after.startDayYYYYMMDD,
    );
    return;
  }

  // Different trackable — fully reverse the old contribution and apply
  // the new one. Handles flips into/out of ACTUAL and trackable swaps.
  if (beforeCounts) {
    await applyDelta(ctx, before.trackableId as Id<"trackables">, {
      totalSeconds: -before.durationSeconds,
      calendarCount: -1,
    });
  }
  if (afterCounts) {
    await applyDelta(
      ctx,
      after.trackableId as Id<"trackables">,
      {
        totalSeconds: after.durationSeconds,
        calendarCount: 1,
      },
      after.startDayYYYYMMDD,
    );
  }
}

/** Call after deleting an ACTUAL `timeWindows` row. */
export async function onAttributedWindowDeleted(
  ctx: MutationCtx,
  args: {
    trackableId?: Id<"trackables">;
    budgetType: "ACTUAL" | "BUDGETED";
    durationSeconds: number;
  },
): Promise<void> {
  if (args.budgetType !== "ACTUAL" || args.trackableId === undefined) return;
  await applyDelta(ctx, args.trackableId, {
    totalSeconds: -args.durationSeconds,
    calendarCount: -1,
  });
}

/** Call after patching `trackableDays.numCompleted` (or inserting/deleting). */
export async function onTrackableDayDelta(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    deltaNumCompleted: number;
    dayYYYYMMDD: string;
  },
): Promise<void> {
  if (args.deltaNumCompleted === 0) return;
  await applyDelta(
    ctx,
    args.trackableId,
    { storedDayCount: args.deltaNumCompleted },
    args.dayYYYYMMDD,
  );
}

/**
 * Adjusts `trackableDays.attributedTaskCount` for a single
 * `(trackableId, dayYYYYMMDD)` pair, creating the row on demand and
 * deleting it when both the manual count and the attributed count drop
 * to zero. `delta` must be ±1 (signed).
 */
async function bumpTrackableDayAttributedTaskCount(
  ctx: MutationCtx,
  trackableId: Id<"trackables">,
  userId: Id<"users">,
  dayYYYYMMDD: string,
  delta: 1 | -1,
): Promise<void> {
  const existing = await ctx.db
    .query("trackableDays")
    .withIndex("by_trackable_day", (q) =>
      q.eq("trackableId", trackableId).eq("dayYYYYMMDD", dayYYYYMMDD),
    )
    .unique();

  if (!existing) {
    // Only create a row on increment; decrementing into a non-existent
    // row is a no-op (the count is already implicitly zero).
    if (delta > 0) {
      await ctx.db.insert("trackableDays", {
        trackableId,
        userId,
        dayYYYYMMDD,
        numCompleted: 0,
        attributedTaskCount: 1,
        comments: "",
      });
    }
    return;
  }

  const next = Math.max(0, (existing.attributedTaskCount ?? 0) + delta);

  // Garbage-collect when the row has nothing left to say. We only
  // delete rows we wouldn't have created in the manual-entry path
  // (numCompleted === 0 and comments is empty); otherwise we'd lose
  // the user's manual annotation.
  if (
    next === 0 &&
    existing.numCompleted === 0 &&
    (existing.comments ?? "") === ""
  ) {
    await ctx.db.delete(existing._id);
    return;
  }

  if (next === (existing.attributedTaskCount ?? 0)) return;
  await ctx.db.patch(existing._id, { attributedTaskCount: next });
}

/**
 * Resolves the attributed trackable for a task using
 * `resolveSnapshotTrackableIdForTask`. Loads `listTrackableLinks` lazily
 * via a cache that the caller can reuse across multiple calls in the
 * same mutation. Returns `undefined` when the task is unattributable.
 */
async function resolveTaskAttribution(
  ctx: MutationCtx,
  task: Pick<Doc<"tasks">, "userId" | "trackableId" | "listId"> | null,
  linkCache: { byUser: Map<string, Map<string, Id<"trackables">>> },
): Promise<Id<"trackables"> | undefined> {
  if (!task) return undefined;
  if (task.trackableId) return task.trackableId;
  if (!task.listId) return undefined;

  let linkMap = linkCache.byUser.get(task.userId);
  if (!linkMap) {
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", task.userId))
      .collect();
    linkMap = buildListIdToTrackableId(links);
    linkCache.byUser.set(task.userId, linkMap);
  }
  return linkMap.get(task.listId) ?? undefined;
}

/**
 * Call from `tasks.upsert` (and any other writer that mutates a task's
 * `dateCompleted`, `trackableId`, or `listId` fields) to keep
 * `trackables.lifetimeAttributedTaskDayCount` in sync with the
 * "completed task counts as 1 day for its attributed trackable" rule
 * that `getGoalDetails` and `getTrackableAnalyticsSeries` apply.
 *
 * Pass `null` for `before` on insert and `null` for `after` on delete.
 * Idempotent — if neither side resolves to a trackable nothing happens.
 */
export async function onTaskCompletionAttribution(
  ctx: MutationCtx,
  before: Pick<
    Doc<"tasks">,
    "userId" | "dateCompleted" | "trackableId" | "listId"
  > | null,
  after: Pick<
    Doc<"tasks">,
    "userId" | "dateCompleted" | "trackableId" | "listId"
  > | null,
): Promise<void> {
  const linkCache = {
    byUser: new Map<string, Map<string, Id<"trackables">>>(),
  };

  const wasCounted = before != null && !!before.dateCompleted;
  const isCounted = after != null && !!after.dateCompleted;

  const beforeTrackable = wasCounted
    ? await resolveTaskAttribution(ctx, before, linkCache)
    : undefined;
  const afterTrackable = isCounted
    ? await resolveTaskAttribution(ctx, after, linkCache)
    : undefined;

  // No net change to attribution → nothing to do, even if the task's
  // `dateCompleted` value itself flipped between two equally-attributed
  // states (the per-day counters track the resolved trackable, not the
  // raw task fields).
  if (
    beforeTrackable === afterTrackable &&
    before?.dateCompleted === after?.dateCompleted
  ) {
    return;
  }

  if (beforeTrackable) {
    await applyDelta(ctx, beforeTrackable, { attributedTaskDayCount: -1 });
    const beforeDay = before?.dateCompleted
      ? toCompactYYYYMMDD(before.dateCompleted)
      : "";
    if (isYYYYMMDDCompact(beforeDay)) {
      await bumpTrackableDayAttributedTaskCount(
        ctx,
        beforeTrackable,
        before!.userId,
        beforeDay,
        -1,
      );
    }
  }
  if (afterTrackable) {
    const afterDay = after?.dateCompleted
      ? toCompactYYYYMMDD(after.dateCompleted)
      : "";
    const validDay = isYYYYMMDDCompact(afterDay) ? afterDay : undefined;
    await applyDelta(
      ctx,
      afterTrackable,
      { attributedTaskDayCount: 1 },
      validDay,
    );
    if (validDay) {
      await bumpTrackableDayAttributedTaskCount(
        ctx,
        afterTrackable,
        after!.userId,
        validDay,
        1,
      );
    }
  }
}

/**
 * Call after inserting / removing / patching a `trackerEntries` row.
 *
 * `deltaRowCount` is +1 on insert, -1 on delete, and 0 on patch (the
 * row already exists). All other deltas are signed.
 */
export async function onTrackerEntryDelta(
  ctx: MutationCtx,
  args: {
    trackableId: Id<"trackables">;
    deltaCountValue: number;
    deltaDurationSeconds: number;
    deltaRowCount: number;
    dayYYYYMMDD: string;
  },
): Promise<void> {
  await applyDelta(
    ctx,
    args.trackableId,
    {
      trackerEntryCount: args.deltaCountValue,
      trackerEntrySeconds: args.deltaDurationSeconds,
      trackerEntryRowCount: args.deltaRowCount,
      // For TRACKER trackables, the entry duration also feeds the
      // overall lifetimeTotalSeconds (mirrors `getGoalDetails`'s
      // `secondsAttributed + (isTracker ? trackerSeconds : 0)`).
      totalSeconds: args.deltaDurationSeconds,
    },
    args.dayYYYYMMDD,
  );
}
