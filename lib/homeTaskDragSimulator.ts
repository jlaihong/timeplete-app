/**
 * Headless replay of a home-list drag, for tests.
 *
 * Runs the same three stages as the real drop, in the same order, using the
 * production modules:
 *
 *   1. `applyHoverTransfer`   — the preview row moving between day groups
 *   2. `resolveTaskDropIndex` — the `toIndex` the client persists
 *   3. `planTaskDayMove`      — the server gap-shift the mutation applies
 *
 * Then it re-groups and re-sorts with `compareTasksForDay`, so assertions
 * read as "after this drag, the day shows these tasks in this order" rather
 * than as order-index arithmetic. Every reorder bug so far has been an
 * off-by-one between those stages, which is exactly what this catches.
 *
 * Only the grouping (overdue bucket, hidden completed rows) is re-stated
 * here; it mirrors `DesktopTaskList`'s `serverGroups` / `displayGroups`.
 */
import { compareTasksForDay } from "../convex/_helpers/compareTasksForDay";
import {
  planTaskDayMove,
  resolveMoveFromDay,
} from "../convex/_helpers/taskDayMove";
import {
  applyHoverTransfer,
  resolveTaskDropIndex,
  type ReorderGroup,
} from "./taskDragReorder";

export const OVERDUE_GROUP_ID = "overdue";

export type SimTask = {
  _id: string;
  taskDay: string;
  taskDayOrderIndex: number;
  dateCompleted?: string;
};

export type SimGroups = ReorderGroup<SimTask>[];

export type HoverStep = {
  groupId: string;
  /** Row under the pointer, or `null` when it is over the dragged row. */
  overTaskId: string | null;
  insertAfterOver?: boolean;
};

export type DropStep = {
  groupId: string;
  overTaskId: string | null;
  /** Dropped on the day container rather than a row (append). */
  overContainer?: boolean;
};

export type SimOptions = {
  today: string;
  tasks: SimTask[];
  /** Mirrors the "Show completed" filter. */
  hideCompleted?: boolean;
};

function groupIdFor(task: SimTask, today: string): string {
  return task.taskDay < today ? OVERDUE_GROUP_ID : task.taskDay;
}

function buildGroups(options: SimOptions): SimGroups {
  const byGroup = new Map<string, SimTask[]>();
  for (const task of options.tasks) {
    if (options.hideCompleted && task.dateCompleted) continue;
    const id = groupIdFor(task, options.today);
    const bucket = byGroup.get(id);
    if (bucket) bucket.push(task);
    else byGroup.set(id, [task]);
  }
  return [...byGroup.keys()]
    .sort((a, b) => {
      if (a === OVERDUE_GROUP_ID) return -1;
      if (b === OVERDUE_GROUP_ID) return 1;
      return a.localeCompare(b);
    })
    .map((id) => ({
      id,
      tasks: (byGroup.get(id) ?? []).slice().sort(compareTasksForDay),
    }));
}

export type DragResult = {
  /** Rendered ids per group after the mutation, keyed by group id. */
  order: Record<string, string[]>;
  /** Preview order the user saw while dragging, keyed by group id. */
  previewOrder: Record<string, string[]>;
  /** What the client sent to `moveOnDay` / `moveBetweenDays`. */
  persisted: { fromDay: string; toDay: string; toIndex: number };
};

function toOrderMap(groups: SimGroups): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const group of groups) out[group.id] = group.tasks.map((t) => t._id);
  return out;
}

export function simulateDrag(
  options: SimOptions,
  drag: { taskId: string; hover?: HoverStep[]; drop: DropStep },
): DragResult {
  const dragged = options.tasks.find((t) => t._id === drag.taskId);
  if (!dragged) throw new Error(`Unknown task ${drag.taskId}`);

  let groups = buildGroups(options);
  const fromGroupId = groupIdFor(dragged, options.today);

  for (const step of drag.hover ?? []) {
    groups = applyHoverTransfer(groups, {
      draggedId: drag.taskId,
      toGroupId: step.groupId,
      overTaskId: step.overTaskId,
      insertAfterOver: step.insertAfterOver,
    });
  }
  const previewOrder = toOrderMap(groups);

  const { toIndex } = resolveTaskDropIndex({
    draggedId: drag.taskId,
    fromGroupId,
    toGroupId: drag.drop.groupId,
    destRows: groups.find((g) => g.id === drag.drop.groupId)?.tasks ?? [],
    overTaskId: drag.drop.overTaskId,
    overContainer: drag.drop.overContainer,
  });

  const fromDay = resolveMoveFromDay(fromGroupId, dragged.taskDay);
  const toDay = drag.drop.groupId;

  const plan = planTaskDayMove({
    tasks: options.tasks.filter(
      (t) => t.taskDay === fromDay || t.taskDay === toDay,
    ),
    taskId: drag.taskId,
    fromDay,
    toDay,
    toIndex,
  });

  const nextTasks = options.tasks.map((task) => {
    const shift = plan.shifts.find((s) => s._id === task._id);
    if (shift) return { ...task, taskDayOrderIndex: shift.taskDayOrderIndex };
    if (plan.moved && task._id === plan.moved._id) {
      return {
        ...task,
        taskDay: plan.moved.taskDay,
        taskDayOrderIndex: plan.moved.taskDayOrderIndex,
      };
    }
    return task;
  });

  return {
    order: toOrderMap(buildGroups({ ...options, tasks: nextTasks })),
    previewOrder,
    persisted: { fromDay, toDay, toIndex },
  };
}

/** Builds `n` incomplete tasks on a day with contiguous order indices. */
export function tasksOnDay(
  taskDay: string,
  ids: string[],
  startOrder = 0,
): SimTask[] {
  return ids.map((id, i) => ({
    _id: id,
    taskDay,
    taskDayOrderIndex: startOrder + i,
  }));
}
