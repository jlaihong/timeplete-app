/**
 * Drops a time-window id from cached `timeWindows.search` subscriptions so the
 * calendar tile disappears immediately when `remove` fires.
 */
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function applyRemoveTimeWindowOptimisticUpdate(
  localStore: OptimisticLocalStore,
  id: Id<"timeWindows">,
): void {
  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const prev = q.value ?? [];
    if (!prev.some((w) => String(w._id) === String(id))) continue;
    const next = prev.filter((w) => String(w._id) !== String(id));
    localStore.setQuery(api.timeWindows.search, q.args, next);
  }
}

/**
 * Drops recurring occurrences on or after `effectiveFromYYYYMMDD` so a
 * "this and following" delete clears the visible tiles immediately.
 */
export function applyStopRecurringEventOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"recurringEvents">; effectiveFromYYYYMMDD: string },
): void {
  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const prev = q.value;
    if (!prev) continue;
    const next = prev.filter((w) => {
      if (String(w.recurringEventId ?? "") !== String(args.id)) return true;
      if (!w.isRecurringInstance || !w.startDayYYYYMMDD) return true;
      return w.startDayYYYYMMDD < args.effectiveFromYYYYMMDD;
    });
    if (next.length !== prev.length) {
      localStore.setQuery(api.timeWindows.search, q.args, next);
    }
  }
}
