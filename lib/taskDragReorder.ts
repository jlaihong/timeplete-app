/**
 * Drag-and-drop index math for the day-grouped task lists.
 *
 * Kept out of the React components so it can be exercised without a DOM or
 * a dnd-kit context: every home-list reorder regression so far has been an
 * off-by-one in here, not in the rendering.
 *
 * Mirrors productivity-one `Tasks.handleTaskDrop`, which reads the index to
 * persist *before* it mutates any array:
 *
 *   toOrderIndex = containerData.items[event.currentIndex]?.taskDayOrderIndex
 *
 * The subtlety that keeps biting: `containerData.items` includes the dragged
 * task for a same-day reorder (CDK has not run `moveItemInArray` yet) and
 * excludes it for a cross-day move (`transferArrayItem` also runs on drop).
 * So the two cases index different lists.
 */
import { maxOrderPlusOne } from "../convex/_helpers/orderShift";

export type ReorderTask = { _id: string; taskDayOrderIndex?: number };
export type ReorderGroup<T extends ReorderTask> = { id: string; tasks: T[] };

/**
 * Cross-group hover: pull the dragged task out of its current group and
 * drop it into `toGroupId` so the user sees one preview row in the day they
 * are pointing at.
 *
 * A no-op once the task already sits in `toGroupId`. Re-splicing on every
 * later hover is what pinned the preview to whichever row the pointer first
 * entered on; within a group the sortable transforms own the movement.
 *
 * Returns the original array when nothing changes so React can bail out.
 */
export function applyHoverTransfer<T extends ReorderTask>(
  groups: ReorderGroup<T>[],
  args: {
    draggedId: string;
    toGroupId: string;
    overTaskId: string | null;
    /** Pointer is past the hovered row's midpoint (entering from below). */
    insertAfterOver?: boolean;
  },
): ReorderGroup<T>[] {
  const fromGroup = groups.find((g) =>
    g.tasks.some((t) => t._id === args.draggedId),
  );
  if (!fromGroup || fromGroup.id === args.toGroupId) return groups;
  if (!groups.some((g) => g.id === args.toGroupId)) return groups;

  const dragged = fromGroup.tasks.find((t) => t._id === args.draggedId);
  if (!dragged) return groups;

  return groups.map((group) => {
    if (group.id === fromGroup.id) {
      return {
        ...group,
        tasks: group.tasks.filter((t) => t._id !== args.draggedId),
      };
    }
    if (group.id !== args.toGroupId) return group;

    let at = group.tasks.length;
    if (args.overTaskId) {
      const idx = group.tasks.findIndex((t) => t._id === args.overTaskId);
      if (idx >= 0) at = idx + (args.insertAfterOver ? 1 : 0);
    }
    return {
      ...group,
      tasks: [
        ...group.tasks.slice(0, at),
        dragged,
        ...group.tasks.slice(at),
      ],
    };
  });
}

export type TaskDropResolution = {
  /** Persisted order index to send to `moveOnDay` / `moveBetweenDays`. */
  toIndex: number;
  /** productivity-one `event.currentIndex`, for a same-day `arrayMove`. */
  currentIndex: number;
  /** Cross-day only: row the task lands above (`null` appends it last). */
  insertAboveId: string | null;
};

export function resolveTaskDropIndex<T extends ReorderTask>(args: {
  draggedId: string;
  /** Group the drag started in, so "overdue -> today" stays a cross move. */
  fromGroupId: string;
  toGroupId: string;
  /** Rendered rows of `toGroupId` at drop time, hover preview included. */
  destRows: T[];
  /** Row under the pointer; `null` when over the dragged row itself. */
  overTaskId: string | null;
  /** Drop landed on the group container rather than a row (append). */
  overContainer?: boolean;
}): TaskDropResolution {
  const isSameGroup = args.fromGroupId === args.toGroupId;
  const items = isSameGroup
    ? args.destRows
    : args.destRows.filter((t) => t._id !== args.draggedId);

  let currentIndex = items.length;
  if (!args.overContainer) {
    const target = args.overTaskId ?? args.draggedId;
    const idx = args.destRows.findIndex((t) => t._id === target);
    if (idx >= 0) currentIndex = idx;
  }

  const landsOn = items[currentIndex];
  return {
    toIndex:
      landsOn?.taskDayOrderIndex ??
      // productivity-one falls back to `event.currentIndex`; our order
      // indices can be sparse after repeated moves, so append past the max.
      maxOrderPlusOne(items.map((t) => t.taskDayOrderIndex)),
    currentIndex,
    insertAboveId: isSameGroup ? null : (landsOn?._id ?? null),
  };
}
