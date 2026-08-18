/**
 * Optimistic cache patches for home/list task reorder mutations.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

type HomeRow = FunctionReturnType<typeof api.tasks.getHomeTasks>[number];

function reorderWithinDay<
  T extends { _id: Id<"tasks">; taskDay?: string; taskDayOrderIndex?: number },
>(rows: T[], taskId: Id<"tasks">, day: string, newOrderIndex: number): T[] {
  const dayRows = rows
    .filter((t) => t.taskDay === day)
    .sort((a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0));
  const moving = dayRows.find((t) => t._id === taskId);
  if (!moving) return rows;
  const without = dayRows.filter((t) => t._id !== taskId);
  const idx = Math.max(0, Math.min(newOrderIndex, without.length));
  without.splice(idx, 0, moving);
  const reindexed = new Map(
    without.map((t, i) => [
      t._id,
      { ...t, taskDay: day, taskDayOrderIndex: i } as T,
    ]),
  );
  return rows.map((t) => reindexed.get(t._id) ?? t);
}

function moveAcrossDays<
  T extends { _id: Id<"tasks">; taskDay?: string; taskDayOrderIndex?: number },
>(
  rows: T[],
  taskId: Id<"tasks">,
  fromDay: string,
  toDay: string,
  newOrderIndex: number,
): T[] {
  const moving = rows.find((t) => t._id === taskId);
  if (!moving) return rows;

  const fromRows = rows
    .filter((t) => t.taskDay === fromDay && t._id !== taskId)
    .sort((a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0));
  const fromReindexed = new Map(
    fromRows.map((t, i) => [
      t._id,
      { ...t, taskDayOrderIndex: i } as T,
    ]),
  );

  const toRows = rows
    .filter((t) => t.taskDay === toDay && t._id !== taskId)
    .sort((a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0));
  const moved = {
    ...moving,
    taskDay: toDay,
    taskDayOrderIndex: newOrderIndex,
  } as T;
  const idx = Math.max(0, Math.min(newOrderIndex, toRows.length));
  toRows.splice(idx, 0, moved);
  const toReindexed = new Map(
    toRows.map((t, i) => [
      t._id,
      { ...t, taskDay: toDay, taskDayOrderIndex: i } as T,
    ]),
  );

  return rows.map((t) => {
    if (t._id === taskId) return toReindexed.get(t._id) ?? moved;
    return fromReindexed.get(t._id) ?? toReindexed.get(t._id) ?? t;
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

export function applyMoveOnDayOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { taskId: Id<"tasks">; day: string; newOrderIndex: number },
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    reorderWithinDay(rows, args.taskId, args.day, args.newOrderIndex),
  );
}

export function applyMoveBetweenDaysOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
    newOrderIndex: number;
  },
): void {
  patchHomeAndSearchDayOrders(localStore, (rows) =>
    moveAcrossDays(
      rows,
      args.taskId,
      args.fromDay,
      args.toDay,
      args.newOrderIndex,
    ),
  );
}

export function applyMoveBetweenSectionsOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    toSectionId: Id<"listSections">;
    newOrderIndex: number;
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

    const sections = page.sections.map((sec) => {
      const isFrom = sec.section._id === fromSectionId;
      const isTo = sec.section._id === args.toSectionId;
      if (!isFrom && !isTo) return sec;

      let tasks = sec.tasks.filter((t) => t._id !== args.taskId);
      if (isTo) {
        const incomplete = tasks.filter((t) => !t.dateCompleted);
        const complete = tasks.filter((t) => !!t.dateCompleted);
        const moved = {
          ...moving!,
          sectionId: args.toSectionId,
          sectionOrderIndex: args.newOrderIndex,
        };
        const target = incomplete;
        const idx = Math.max(0, Math.min(args.newOrderIndex, target.length));
        target.splice(idx, 0, moved);
        const reindexedIncomplete = target.map((t, i) => ({
          ...t,
          sectionId: args.toSectionId,
          sectionOrderIndex: i,
        }));
        tasks = [...reindexedIncomplete, ...complete];
      } else if (isFrom) {
        const incomplete = tasks.filter((t) => !t.dateCompleted);
        const complete = tasks.filter((t) => !!t.dateCompleted);
        tasks = [
          ...incomplete.map((t, i) => ({ ...t, sectionOrderIndex: i })),
          ...complete,
        ];
      }
      return { ...sec, tasks };
    });

    localStore.setQuery(api.lists.getPaginated, q.args, {
      ...page,
      sections,
    });
  }
}
