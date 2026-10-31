/**
 * Reorder active trackables the way productivity-one does.
 *
 * The goals page drops a card onto another and sends that card's
 * `orderIndex` to `move-trackable`. The backend shifts the bounded
 * range, then sets the moved row to that index. Home and the
 * Trackables page both sort by `orderIndex`, so one move updates both.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { applyBoundedOrderShift } from "../convex/_helpers/orderShift";

type Ordered = { _id: string; orderIndex: number; archived?: boolean };

export function applyTrackableOrderMove<T extends Ordered>(
  items: T[],
  movedId: string,
  toIndex: number,
): T[] {
  const moved = items.find((item) => item._id === movedId);
  if (!moved) return items;
  const fromIndex = moved.orderIndex;
  if (fromIndex === toIndex) return items;

  const shifted = applyBoundedOrderShift(
    items,
    (item) => item.orderIndex,
    (item, order) => ({ ...item, orderIndex: order }),
    fromIndex,
    toIndex,
    (item) => item._id === movedId,
  );

  return shifted.map((item) =>
    item._id === movedId ? { ...item, orderIndex: toIndex } : item,
  );
}

export function sortTrackablesByOrder<T extends Ordered>(items: T[]): T[] {
  return [...items].sort((a, b) => a.orderIndex - b.orderIndex);
}

/**
 * `toIndex` for a drop onto `overId`, matching productivity-one
 * `goals-page.ts` (`containerData[currentIndex].orderIndex`).
 * Returns null when the drop does not change order.
 */
export function trackableDropToIndex<T extends Ordered>(
  items: T[],
  activeId: string,
  overId: string,
): number | null {
  if (activeId === overId) return null;
  const active = items.find((item) => item._id === activeId);
  const over = items.find((item) => item._id === overId);
  if (!active || !over) return null;
  if (active.orderIndex === over.orderIndex) return null;
  return over.orderIndex;
}

export function applyTrackableMoveOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"trackables">; toIndex: number },
) {
  for (const q of localStore.getAllQueries(api.trackables.getGoalDetails)) {
    const value = q.value;
    if (!value) continue;
    const combined = [...value.active, ...value.archived];
    if (!combined.some((item) => item._id === args.id)) continue;
    const next = applyTrackableOrderMove(combined, args.id, args.toIndex);
    localStore.setQuery(api.trackables.getGoalDetails, q.args, {
      ...value,
      active: sortTrackablesByOrder(next.filter((item) => !item.archived)),
      archived: sortTrackablesByOrder(next.filter((item) => !!item.archived)),
    });
  }
}
