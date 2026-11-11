/**
 * Flips `archived` on cached list queries so a list leaves the sidebar and
 * the active tab as soon as archive is pressed.
 */
import type { OptimisticLocalStore } from "convex/browser";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

export function applyArchiveListOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"lists"> },
): void {
  for (const q of localStore.getAllQueries(api.lists.search)) {
    const prev = q.value;
    if (!prev) continue;
    const next = prev.map((list) =>
      list._id === args.id ? { ...list, archived: !list.archived } : list,
    );
    localStore.setQuery(api.lists.search, q.args, next);
  }

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const prev = q.value;
    if (!prev || prev.list._id !== args.id) continue;
    localStore.setQuery(api.lists.getPaginated, q.args, {
      ...prev,
      list: { ...prev.list, archived: !prev.list.archived },
    });
  }
}
