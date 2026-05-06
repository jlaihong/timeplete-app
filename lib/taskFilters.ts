/**
 * Shared task filter predicates for List detail, Home, and any other surfaces
 * that must stay in strict parity.
 */

export function taskCompletedForFilters(task: {
  dateCompleted?: string | undefined;
}): boolean {
  const d = task.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

/**
 * List + Home assignee filter: match if task creator OR assignee is selected.
 * When `filterUserIds` is empty, callers typically skip filtering (show all).
 */
export function taskMatchesUserFilter(
  task: {
    createdBy: string;
    assignedToUserId?: string | undefined;
  },
  filterUserIds: string[],
): boolean {
  if (filterUserIds.length === 0) return true;
  const c = task.createdBy;
  const a = task.assignedToUserId;
  return (
    (!!c && filterUserIds.includes(String(c))) ||
    (!!a && filterUserIds.includes(String(a)))
  );
}

export type TaskFilterMember = {
  userId: string;
  name: string;
};
