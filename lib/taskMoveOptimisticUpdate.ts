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
import { applyTillEndShift } from "../convex/_helpers/orderShift";
import { planTaskDayMove } from "../convex/_helpers/taskDayMove";

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
 * Sections still address the slot by `sectionOrderIndex`, which has the same
 * duplicate exposure days had before `insertAboveTaskId`. Left as-is for now;
 * list reorder has not been reported wrong.
 */
export function applyMoveBetweenSectionsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    toSectionId: Id<"listSections">;
    toIndex?: number;
    newOrderIndex?: number;
  },
): void {
  const toIndex = args.toIndex ?? args.newOrderIndex;
  if (toIndex === undefined) return;

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;

    let moving: (typeof page.sections)[number]["tasks"][number] | null = null;
    let fromSectionId: Id<"listSections"> | null = null;
    for (const sec of page.sections) {
      const found = sec.tasks.find((t) => t._id === args.taskId);
      if (found) {
        moving = found;
        fromSectionId = sec.section._id;
        break;
      }
    }
    if (!moving || !fromSectionId) continue;

    const fromIndex = moving.sectionOrderIndex ?? 0;
    const flat = page.sections.flatMap((sec) =>
      sec.tasks.map((t) => ({
        ...t,
        _sectionId: sec.section._id as Id<"listSections">,
      })),
    );
    const shifted = applyTillEndShift(
      flat,
      (t) => t.sectionOrderIndex ?? 0,
      (t, order) => ({ ...t, sectionOrderIndex: order }),
      fromIndex,
      toIndex,
      (t) => t._id === args.taskId,
      (t) => t._sectionId === fromSectionId,
      (t) => t._sectionId === args.toSectionId,
    );
    const byId = new Map(shifted.map((t) => [t._id, t]));

    const sections = page.sections.map((sec) => {
      const isFrom = sec.section._id === fromSectionId;
      const isTo = sec.section._id === args.toSectionId;
      const tasks = sec.tasks
        .filter((t) => t._id !== args.taskId)
        .map((t) => {
          const next = byId.get(t._id);
          return next
            ? { ...t, sectionOrderIndex: next.sectionOrderIndex }
            : t;
        });
      if (isTo) {
        tasks.push({
          ...moving!,
          sectionId: args.toSectionId,
          sectionOrderIndex: toIndex,
        });
      } else if (isFrom) {
        // moved row already removed
      }
      tasks.sort((a, b) => {
        const aDone = a.dateCompleted ? 1 : 0;
        const bDone = b.dateCompleted ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;
        return (a.sectionOrderIndex ?? 0) - (b.sectionOrderIndex ?? 0);
      });
      return { ...sec, tasks };
    });

    localStore.setQuery(api.lists.getPaginated, q.args, {
      ...page,
      sections,
    });
  }
}
