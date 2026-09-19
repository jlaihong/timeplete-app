import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Productivity-one / productivity-backend reorder primitives.
 *
 * Day and section task moves use "shift from index to end":
 *   close gap: everyone with order >= fromIndex gets -1
 *   open gap:  everyone with order >= toIndex gets +1
 *   moved row is then set to toIndex
 *
 * Collection moves (lists, tags, trackables, review questions, sections)
 * use a bounded range:
 *   forward (from < to):  decrement [from, to]
 *   backward (from > to): increment [to, from]
 *   then set the moved row to toIndex
 *
 * `toIndex` is always a persisted order field (e.g. B.taskDayOrderIndex),
 * never a filtered frontend slot.
 */

export function maxOrderPlusOne(
  orders: Array<number | undefined | null>,
): number {
  let max = -1;
  for (const o of orders) {
    if (o != null && Number.isFinite(o) && o > max) max = o;
  }
  return max + 1;
}

/**
 * After a flattened-list arrayMove, recover the drop-target backend index.
 * Moving down: the item we landed on is now immediately before us.
 * Moving up: the item we landed above is now immediately after us.
 */
export function toIndexAfterFlatMove(args: {
  from: number;
  to: number;
  neighborOrder: number | undefined;
  neighborInSameGroup: boolean;
  fallbackOrders: Array<number | undefined | null>;
}): number {
  if (args.neighborInSameGroup && args.neighborOrder != null) {
    return args.neighborOrder;
  }
  return maxOrderPlusOne(args.fallbackOrders);
}

export function applyTillEndShift<T>(
  items: T[],
  getOrder: (item: T) => number,
  setOrder: (item: T, order: number) => T,
  fromIndex: number,
  toIndex: number,
  isMoved: (item: T) => boolean,
  inFromGroup: (item: T) => boolean,
  inToGroup: (item: T) => boolean,
): T[] {
  const afterClose = items.map((item) => {
    if (isMoved(item)) return item;
    if (inFromGroup(item) && getOrder(item) >= fromIndex) {
      return setOrder(item, getOrder(item) - 1);
    }
    return item;
  });
  return afterClose.map((item) => {
    if (isMoved(item)) return item;
    if (inToGroup(item) && getOrder(item) >= toIndex) {
      return setOrder(item, getOrder(item) + 1);
    }
    return item;
  });
}

export function applyBoundedOrderShift<T>(
  items: T[],
  getOrder: (item: T) => number,
  setOrder: (item: T, order: number) => T,
  fromIndex: number,
  toIndex: number,
  isMoved: (item: T) => boolean,
): T[] {
  if (fromIndex === toIndex) return items;
  if (fromIndex < toIndex) {
    return items.map((item) => {
      if (isMoved(item)) return item;
      const order = getOrder(item);
      if (order >= fromIndex && order <= toIndex) {
        return setOrder(item, order - 1);
      }
      return item;
    });
  }
  return items.map((item) => {
    if (isMoved(item)) return item;
    const order = getOrder(item);
    if (order >= toIndex && order <= fromIndex) {
      return setOrder(item, order + 1);
    }
    return item;
  });
}

type OrderableTable =
  | "lists"
  | "tags"
  | "trackables"
  | "reviewQuestions"
  | "listSections";

export async function persistBoundedOrderMove(
  ctx: MutationCtx,
  items: Array<{ _id: Id<OrderableTable>; orderIndex: number }>,
  movedId: Id<OrderableTable> | string,
  toIndex: number,
): Promise<void> {
  const moved = items.find((item) => item._id === movedId);
  if (!moved) return;
  const fromIndex = moved.orderIndex;
  if (fromIndex === toIndex) return;

  const shifted = applyBoundedOrderShift(
    items,
    (item) => item.orderIndex,
    (item, order) => ({ ...item, orderIndex: order }),
    fromIndex,
    toIndex,
    (item) => item._id === movedId,
  );

  for (const next of shifted) {
    if (next._id === movedId) continue;
    const prev = items.find((item) => item._id === next._id);
    if (prev && next.orderIndex !== prev.orderIndex) {
      await ctx.db.patch(next._id, { orderIndex: next.orderIndex });
    }
  }
  await ctx.db.patch(moved._id, { orderIndex: toIndex });
}
