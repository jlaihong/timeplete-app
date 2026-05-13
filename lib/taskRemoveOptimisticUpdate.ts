/**
 * Optimistic Convex cache patches for deleting tasks (`tasks.remove`,
 * `recurringTasks.deleteInstance`).
 *
 * Keeps parity with Convex `tasks.remove` and its `by_root` cascade
 * when enabled; recurring instance deletes only strip the targeted id.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

type TaskRowMinimal = {
  _id: Id<"tasks">;
  rootTaskId?: Id<"tasks">;
};

function shouldRemoveRow(
  t: TaskRowMinimal,
  deletedId: Id<"tasks">,
  cascadeRootChildren: boolean,
): boolean {
  if (t._id === deletedId) return true;
  return (
    cascadeRootChildren &&
    t.rootTaskId === deletedId &&
    t._id !== deletedId
  );
}

export type RemoveTaskOptimisticOpts = {
  /**
   * `true`: match `tasks.remove` — strip the row and descendants with
   * `rootTaskId === deletedId`. `false`: match `deleteInstance` — only strip
   * `deletedId`.
   */
  cascadeRootChildren?: boolean;
};

export function applyTaskRemoveOptimisticUpdate(
  localStore: OptimisticLocalStore,
  deletedId: Id<"tasks">,
  opts?: RemoveTaskOptimisticOpts,
): void {
  const cascadeRootChildren = opts?.cascadeRootChildren ?? true;
  const keep = (t: TaskRowMinimal) =>
    !shouldRemoveRow(t, deletedId, cascadeRootChildren);

  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const value = q.value;
    if (!value?.length) continue;
    const next = value.filter(keep);
    if (next.length === value.length) continue;
    localStore.setQuery(
      api.tasks.getHomeTasks,
      q.args,
      next as FunctionReturnType<typeof api.tasks.getHomeTasks>,
    );
  }

  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const value = q.value;
    if (!value?.length) continue;
    const next = value.filter(keep);
    if (next.length === value.length) continue;
    localStore.setQuery(
      api.tasks.searchWithCriteria,
      q.args,
      next as FunctionReturnType<typeof api.tasks.searchWithCriteria>,
    );
  }

  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const value = q.value;
    if (!value?.length) continue;
    const next = value.filter(keep);
    if (next.length === value.length) continue;
    localStore.setQuery(
      api.tasks.search,
      q.args,
      next as FunctionReturnType<typeof api.tasks.search>,
    );
  }

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page?.sections?.length) continue;
    let pageTouched = false;
    const sections = page.sections.map((sec) => {
      const filtered = sec.tasks.filter(
        (t) => keep(t as unknown as TaskRowMinimal),
      );
      const removedCount = sec.tasks.length - filtered.length;
      if (removedCount <= 0) return sec;
      pageTouched = true;
      return {
        ...sec,
        tasks: filtered,
        totalTasks: Math.max(0, sec.totalTasks - removedCount),
      };
    });

    if (pageTouched) {
      localStore.setQuery(
        api.lists.getPaginated,
        q.args,
        { ...page, sections } as FunctionReturnType<
          typeof api.lists.getPaginated
        >,
      );
    }
  }
}
