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
