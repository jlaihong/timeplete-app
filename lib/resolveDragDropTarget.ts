/**
 * dnd-kit `pointerWithin` often returns the wrapping group droppable
 * first because it contains every row. Prefer task rows, including the
 * dragged row: excluding it makes the original slot untargetable
 * (preview jumps to the neighbor).
 *
 * Calendar hour cells are large sibling droppables. They may intersect
 * the dragged rect (or win `closestCenter`) while the pointer is still
 * over the task list. Only `pointerWithin` may treat them as a hit.
 */

const CAL_PREFIX = "cal-hour-";

function isCalendarCollision(id: unknown): boolean {
  return String(id).startsWith(CAL_PREFIX);
}

function isGroupCollision(
  id: unknown,
  type: string | undefined,
): boolean {
  return type === "group" || String(id).startsWith("group:");
}

function isTaskCollision(
  id: unknown,
  type: string | undefined,
): boolean {
  if (isCalendarCollision(id) || isGroupCollision(id, type)) return false;
  return type === "task" || type !== "group";
}

export function preferNonContainerCollisions<
  T extends { id: unknown; data?: { current?: { type?: string } } },
>(collisions: T[]): T[] {
  const tasks = collisions.filter((c) =>
    isTaskCollision(c.id, c.data?.current?.type),
  );
  return tasks.length > 0
    ? tasks
    : collisions.filter((c) => !isCalendarCollision(c.id));
}

export function pointerWithinCalendar<
  T extends { id: unknown },
>(collisions: T[]): T[] {
  return collisions.filter((c) => isCalendarCollision(c.id));
}

type CollisionId = string | number;

type CollisionArgs = {
  active: { id: CollisionId };
  pointerCoordinates?: { x: number; y: number } | null;
  droppableRects: {
    get: (
      id: CollisionId,
    ) => { top: number; left: number; width: number; height: number } | undefined;
  };
};

/**
 * Among task collisions, pick the row whose rect contains the pointer
 * (else the closest center). The dragged row is a valid target so the
 * start slot can be dropped on again.
 */
export function pickPointerTaskCollisions<T extends { id: CollisionId }>(
  args: CollisionArgs,
  collisions: T[],
): T[] {
  const tasks = preferNonContainerCollisions(collisions);
  const pointer = args.pointerCoordinates;
  if (!pointer || tasks.length <= 1) return tasks;

  let containing: T | null = null;
  let containingDist = Infinity;
  let closest: T | null = null;
  let closestDist = Infinity;
  for (const collision of tasks) {
    const rect = args.droppableRects.get(collision.id);
    if (!rect) continue;
    const cy = rect.top + rect.height / 2;
    const inside =
      pointer.x >= rect.left &&
      pointer.x <= rect.left + rect.width &&
      pointer.y >= rect.top &&
      pointer.y <= rect.top + rect.height;
    if (inside) {
      const dist = Math.abs(pointer.y - cy);
      if (dist < containingDist) {
        containingDist = dist;
        containing = collision;
      }
      continue;
    }
    const cx = rect.left + rect.width / 2;
    const dist = (pointer.x - cx) ** 2 + (pointer.y - cy) ** 2;
    if (dist < closestDist) {
      closestDist = dist;
      closest = collision;
    }
  }
  const picked = containing ?? closest;
  return picked ? [picked] : tasks;
}

export function resolveDragDropTargetId(
  event: {
    over: { id: unknown; data?: { current?: { type?: string } } } | null;
    collisions?: Array<{
      id: unknown;
      data?: { current?: { type?: string } };
    }> | null;
  },
  draggedId: string,
  isTaskId: (id: string) => boolean,
): string | null {
  const consider = (id: string, type: string | undefined): string | null => {
    if (id === draggedId) return null;
    if (isCalendarCollision(id) || isGroupCollision(id, type)) return null;
    if (type === "task" || isTaskId(id)) return id;
    return null;
  };

  if (event.over) {
    const hit = consider(
      String(event.over.id),
      event.over.data?.current?.type,
    );
    if (hit) return hit;
  }

  for (const collision of event.collisions ?? []) {
    const hit = consider(String(collision.id), collision.data?.current?.type);
    if (hit) return hit;
  }

  return null;
}
