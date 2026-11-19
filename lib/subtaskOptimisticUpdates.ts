/**
 * Optimistic cache patches for subtasks (`convex/subtasks.ts`).
 *
 * Two things are kept in step locally so the UI answers at once:
 *   - `subtasks.list({ parentId })`, the rows under an expanded task;
 *   - the parent's `subtaskCount` / `subtaskCompletedCount`, wherever the
 *     parent row is cached (home, list pages, the detail sheet).
 */
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";

type TaskRow = Doc<"tasks">;

/** Apply `patch` to a task row in every task query that holds it. */
function patchTaskEverywhere(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  patch: (row: TaskRow) => Partial<TaskRow>,
): void {
  const patchRows = <T extends { _id: Id<"tasks"> }>(rows: T[]): T[] | null => {
    const idx = rows.findIndex((t) => t._id === taskId);
    if (idx === -1) return null;
    const next = [...rows];
    next[idx] = { ...rows[idx], ...patch(rows[idx] as unknown as TaskRow) };
    return next;
  };

  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const next = q.value ? patchRows(q.value) : null;
    if (next) localStore.setQuery(api.tasks.getHomeTasks, q.args, next);
  }
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const next = q.value ? patchRows(q.value) : null;
    if (next) localStore.setQuery(api.tasks.searchWithCriteria, q.args, next);
  }
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const next = q.value ? patchRows(q.value) : null;
    if (next) localStore.setQuery(api.tasks.search, q.args, next);
  }
  for (const q of localStore.getAllQueries(api.tasks.getById)) {
    if (q.value && q.value._id === taskId) {
      localStore.setQuery(api.tasks.getById, q.args, {
        ...q.value,
        ...patch(q.value),
      });
    }
  }
  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;
    let found = false;
    const sections = page.sections.map((sec) => {
      const next = patchRows(sec.tasks);
      if (!next) return sec;
      found = true;
      return { ...sec, tasks: next };
    });
    if (found) {
      localStore.setQuery(api.lists.getPaginated, q.args, {
        ...page,
        sections,
      });
    }
  }
}

function cachedSubtasks(
  localStore: OptimisticLocalStore,
  parentId: Id<"tasks">,
): TaskRow[] | undefined {
  return localStore.getQuery(api.subtasks.list, { parentId });
}

/** Replace a task's cached subtasks and bring its counts in line. */
function setSubtasks(
  localStore: OptimisticLocalStore,
  parentId: Id<"tasks">,
  next: TaskRow[],
): void {
  localStore.setQuery(api.subtasks.list, { parentId }, next);
  const count = next.length;
  const done = next.filter((t) => !!t.dateCompleted).length;
  patchTaskEverywhere(localStore, parentId, () => ({
    subtaskCount: count > 0 ? count : undefined,
    subtaskCompletedCount: count > 0 ? done : undefined,
  }));
}

function findSubtask(
  localStore: OptimisticLocalStore,
  id: Id<"tasks">,
): { parentId: Id<"tasks">; rows: TaskRow[] } | null {
  for (const q of localStore.getAllQueries(api.subtasks.list)) {
    if (q.value?.some((t) => t._id === id)) {
      return { parentId: q.args.parentId, rows: q.value };
    }
  }
  return null;
}

export function applyAddSubtaskOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { parentId: Id<"tasks">; name: string; clientMutationId?: string },
): void {
  const rows = cachedSubtasks(localStore, args.parentId);
  if (rows === undefined) {
    // List not loaded (row collapsed): just bump the count.
    patchTaskEverywhere(localStore, args.parentId, (row) => ({
      subtaskCount: (row.subtaskCount ?? 0) + 1,
      subtaskCompletedCount: row.subtaskCompletedCount ?? 0,
    }));
    return;
  }
  const now = Date.now();
  const userId = (rows[0]?.userId ?? ("" as Id<"users">)) as Id<"users">;
  const synthetic = {
    _id: `__optimistic_subtask__:${args.clientMutationId ?? now}` as Id<"tasks">,
    _creationTime: now,
    name: args.name.trim(),
    parentId: args.parentId,
    rootTaskId: args.parentId,
    subtaskOrderIndex:
      rows.reduce((max, t) => Math.max(max, t.subtaskOrderIndex ?? 0), -1) + 1,
    timeSpentInSecondsUnallocated: 0,
    timeEstimatedInSecondsUnallocated: 0,
    taskDayOrderIndex: 0,
    sectionOrderIndex: 0,
    isRecurringInstance: false,
    userId,
    createdBy: userId,
  } as TaskRow;
  setSubtasks(localStore, args.parentId, [...rows, synthetic]);
}

export function applySetSubtaskCompletedOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"tasks">; completed: boolean; day: string },
): void {
  const found = findSubtask(localStore, args.id);
  if (!found) return;
  setSubtasks(
    localStore,
    found.parentId,
    found.rows.map((t) =>
      t._id === args.id
        ? { ...t, dateCompleted: args.completed ? args.day : undefined }
        : t,
    ),
  );
}

export function applyRenameSubtaskOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"tasks">; name: string },
): void {
  const found = findSubtask(localStore, args.id);
  if (!found) return;
  setSubtasks(
    localStore,
    found.parentId,
    found.rows.map((t) =>
      t._id === args.id ? { ...t, name: args.name.trim() } : t,
    ),
  );
}

export function applyMoveSubtaskOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"tasks">; toIndex: number },
): void {
  const found = findSubtask(localStore, args.id);
  if (!found) return;
  const moving = found.rows.find((t) => t._id === args.id)!;
  const others = found.rows.filter((t) => t._id !== args.id);
  const toIndex = Math.max(0, Math.min(others.length, args.toIndex));
  const ordered = [
    ...others.slice(0, toIndex),
    moving,
    ...others.slice(toIndex),
  ].map((t, i) => ({ ...t, subtaskOrderIndex: i }));
  setSubtasks(localStore, found.parentId, ordered);
}

export function applyRemoveSubtaskOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { id: Id<"tasks"> },
): void {
  const found = findSubtask(localStore, args.id);
  if (!found) return;
  setSubtasks(
    localStore,
    found.parentId,
    found.rows.filter((t) => t._id !== args.id),
  );
}

/** Completing a task completes its open subtasks (server rule). */
export function applyParentCompletedToSubtasks(
  localStore: OptimisticLocalStore,
  parentId: Id<"tasks">,
  dateCompleted: string,
): void {
  const rows = cachedSubtasks(localStore, parentId);
  if (rows === undefined) {
    patchTaskEverywhere(localStore, parentId, (row) =>
      row.subtaskCount
        ? { subtaskCompletedCount: row.subtaskCount }
        : {},
    );
    return;
  }
  if (rows.every((t) => !!t.dateCompleted)) return;
  setSubtasks(
    localStore,
    parentId,
    rows.map((t) => (t.dateCompleted ? t : { ...t, dateCompleted })),
  );
}

/** Add tracked seconds to a cached subtask (timer stopped on it). */
export function applySubtaskTimeDelta(
  localStore: OptimisticLocalStore,
  subtaskId: Id<"tasks">,
  deltaSeconds: number,
): void {
  const found = findSubtask(localStore, subtaskId);
  if (!found) return;
  localStore.setQuery(
    api.subtasks.list,
    { parentId: found.parentId },
    found.rows.map((t) =>
      t._id === subtaskId
        ? {
            ...t,
            timeSpentInSecondsUnallocated: Math.max(
              0,
              (t.timeSpentInSecondsUnallocated ?? 0) + deltaSeconds,
            ),
          }
        : t,
    ),
  );
}

/** A cached subtask's name, for the optimistic timer title. */
export function cachedSubtaskName(
  localStore: OptimisticLocalStore,
  subtaskId: Id<"tasks">,
): string | undefined {
  return findSubtask(localStore, subtaskId)?.rows.find(
    (t) => t._id === subtaskId,
  )?.name;
}

/**
 * Set a cached subtask's tracked seconds. Returns the change, so the
 * caller can move the parent's total by the same amount.
 */
export function applySubtaskTimeAbsolute(
  localStore: OptimisticLocalStore,
  subtaskId: Id<"tasks">,
  seconds: number,
): number {
  const before =
    findSubtask(localStore, subtaskId)?.rows.find((t) => t._id === subtaskId)
      ?.timeSpentInSecondsUnallocated ?? 0;
  const delta = Math.max(0, Math.floor(seconds)) - before;
  if (delta !== 0) applySubtaskTimeDelta(localStore, subtaskId, delta);
  return delta;
}
