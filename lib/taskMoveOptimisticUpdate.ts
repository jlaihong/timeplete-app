/**
 * Optimistic cache patches for home/list task reorder mutations.
 * Uses the same gap-shift as productivity-one: `toIndex` is a persisted
 * order field, not a filtered frontend slot.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { applyTillEndShift } from "../convex/_helpers/orderShift";

type HomeRow = FunctionReturnType<typeof api.tasks.getHomeTasks>[number];

function shiftDayOrders<
  T extends { _id: Id<"tasks">; taskDay?: string; taskDayOrderIndex?: number },
>(
  rows: T[],
  taskId: Id<"tasks">,
  fromDay: string,
  toDay: string,
  toIndex: number,
): T[] {
  const moving = rows.find((t) => t._id === taskId);
  if (!moving) return rows;
  const fromIndex = moving.taskDayOrderIndex ?? 0;
  if (fromDay === toDay && fromIndex === toIndex) return rows;

  const shifted = applyTillEndShift(
    rows,
    (t) => t.taskDayOrderIndex ?? 0,
    (t, order) => ({ ...t, taskDayOrderIndex: order }),
    fromIndex,
    toIndex,
    (t) => t._id === taskId,
    (t) => t.taskDay === fromDay,
    (t) => t.taskDay === toDay,
  );
  return shifted.map((t) =>
    t._id === taskId
      ? ({ ...t, taskDay: toDay, taskDayOrderIndex: toIndex } as T)
      : t,
  );
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

export function applyMoveOnDayOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { taskId: Id<"tasks">; day: string; toIndex: number },
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    shiftDayOrders(rows, args.taskId, args.day, args.day, args.toIndex),
  );
}

export function applyMoveBetweenDaysOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
    toIndex: number;
  },
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    shiftDayOrders(rows, args.taskId, args.fromDay, args.toDay, args.toIndex),
  );
}

export function applyMoveBetweenSectionsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    toSectionId: Id<"listSections">;
    toIndex: number;
  },
): void {
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
      args.toIndex,
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
          sectionOrderIndex: args.toIndex,
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
