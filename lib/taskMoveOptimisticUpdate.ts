/**
 * Optimistic cache patches for home/list task reorder mutations.
 *
 * Day moves run the mutation's own `planTaskDayMove`, so the preview and
 * the server land on the same order. Reimplementing the placement here is
 * what used to make a row settle one slot away from where it was dropped.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { planTaskDayMove } from "../convex/_helpers/taskDayMove";
import {
  compareTasksForListView,
  planTaskSectionMove,
} from "../convex/_helpers/taskSectionMove";

type HomeRow = FunctionReturnType<typeof api.tasks.getHomeTasks>[number];

function shiftDayOrders<
  T extends {
    _id: Id<"tasks">;
    taskDay?: string;
    taskDayOrderIndex?: number;
    dateCompleted?: string;
    _creationTime?: number;
  },
>(
  rows: T[],
  taskId: Id<"tasks">,
  fromDay: string,
  toDay: string,
  placement: { insertAboveId?: Id<"tasks"> | null; toIndex?: number },
): T[] {
  if (!rows.some((t) => t._id === taskId)) return rows;

  const plan = planTaskDayMove({
    tasks: rows.filter((t) => t.taskDay === fromDay || t.taskDay === toDay),
    taskId,
    fromDay,
    toDay,
    ...placement,
  });
  if (!plan.moved) return rows;

  const shifts = new Map(plan.shifts.map((s) => [s._id, s.taskDayOrderIndex]));
  return rows.map((t) => {
    if (t._id === taskId) {
      return { ...t, taskDay: toDay, taskDayOrderIndex: plan.moved!.taskDayOrderIndex };
    }
    const next = shifts.get(t._id);
    return next === undefined ? t : { ...t, taskDayOrderIndex: next };
  });
}

function patchHomeAndSearchDayOrders(
  localStore: OptimisticLocalStore,
  patchRows: (rows: HomeRow[]) => HomeRow[],
): void {
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    if (!q.value) continue;
    localStore.setQuery(
      api.tasks.getHomeTasks,
      q.args,
      patchRows(q.value as HomeRow[]),
    );
  }
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    if (!q.value) continue;
    localStore.setQuery(
      api.tasks.searchWithCriteria,
      q.args,
      patchRows(q.value as HomeRow[]),
    );
  }
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    if (!q.value) continue;
    localStore.setQuery(
      api.tasks.search,
      q.args,
      patchRows(q.value as HomeRow[]),
    );
  }
}

type DayMovePlacement = {
  insertAboveTaskId?: Id<"tasks"> | null;
  toIndex?: number;
};

function placementFrom(args: DayMovePlacement): {
  insertAboveId?: Id<"tasks"> | null;
  toIndex?: number;
} {
  return args.insertAboveTaskId !== undefined
    ? { insertAboveId: args.insertAboveTaskId }
    : { toIndex: args.toIndex };
}

export function applyMoveOnDayOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { taskId: Id<"tasks">; day: string } & DayMovePlacement,
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    shiftDayOrders(rows, args.taskId, args.day, args.day, placementFrom(args)),
  );
}

export function applyMoveBetweenDaysOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
  } & DayMovePlacement,
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    shiftDayOrders(
      rows,
      args.taskId,
      args.fromDay,
      args.toDay,
      placementFrom(args),
    ),
  );
}

/**
 * Runs the mutation's own `planTaskSectionMove`, for the same reason day
 * moves run `planTaskDayMove`.
 */
export function applyMoveBetweenSectionsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    toSectionId: Id<"listSections">;
    insertAboveTaskId?: Id<"tasks"> | null;
    toIndex?: number;
    newOrderIndex?: number;
  },
): void {
  const toIndex = args.toIndex ?? args.newOrderIndex;
  if (args.insertAboveTaskId === undefined && toIndex === undefined) return;

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;

    const shownIn = new Map<string, Id<"listSections">>();
    for (const sec of page.sections) {
      for (const t of sec.tasks) shownIn.set(t._id, sec.section._id);
    }
    if (!shownIn.has(args.taskId)) continue;
    if (!page.sections.some((sec) => sec.section._id === args.toSectionId)) {
      continue;
    }

    const flat = page.sections.flatMap((sec) => sec.tasks);
    const plan = planTaskSectionMove({
      tasks: flat,
      taskId: args.taskId,
      sectionOf: (t) => shownIn.get(t._id) ?? "",
      toSectionId: args.toSectionId,
      ...(args.insertAboveTaskId !== undefined
        ? { insertAboveId: args.insertAboveTaskId }
        : { toIndex }),
    });
    if (!plan.moved) continue;

    const moving = flat.find((t) => t._id === args.taskId)!;
    const shifts = new Map(
      plan.shifts.map((s) => [s._id, s.sectionOrderIndex]),
    );

    const sections = page.sections.map((sec) => {
      const tasks = sec.tasks
        .filter((t) => t._id !== args.taskId)
        .map((t) => {
          const next = shifts.get(t._id);
          return next === undefined ? t : { ...t, sectionOrderIndex: next };
        });
      if (sec.section._id === args.toSectionId) {
        tasks.push({
          ...moving,
          sectionId: args.toSectionId,
          sectionOrderIndex: plan.moved!.sectionOrderIndex,
        });
      }
      tasks.sort(compareTasksForListView);
      return { ...sec, tasks };
    });

    localStore.setQuery(api.lists.getPaginated, q.args, {
      ...page,
      sections,
    });
  }
}
