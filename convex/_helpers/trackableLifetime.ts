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
 *   trackable.firstActivityDayYYYYMMDD
 *     === min day across all attributed windows / days / entries; falls
 *         back to `startDayYYYYMMDD` when no activity recorded.
 *
 * The "task-completion → trackableDay" attribution path (a task with
 * `trackableId === X` being marked complete counts as a day for X) is
 * NOT folded into these denormalized totals — it lives in `tasks.ts`
 * and would require touching every task writer to maintain. Readers
 * recompute the task-completion contribution on demand (and it's bounded
 * by date range), so they can be safely added to the denormalized
 * baseline.
 */
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

type LifetimePatch = {
  totalSeconds?: number;
  calendarCount?: number;
  storedDayCount?: number;
  trackerEntryCount?: number;
  trackerEntrySeconds?: number;
  trackerEntryRowCount?: number;
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
