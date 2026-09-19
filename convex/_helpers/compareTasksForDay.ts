/**
 * Home / today-list order. Must match productivity-one `compareTasksForDay`
 * and the client (`DesktopTaskList` / `TaskList`): incomplete first, then
 * `taskDayOrderIndex`.
 *
 * Display sort only. Mutations persist gap-shifts against the drop
 * target's `taskDayOrderIndex`, not this visual slot.
 */
export function isTaskCompletedForDayReorder(t: {
  dateCompleted?: string;
}): boolean {
  const d = t.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

export function compareTasksForDay<
  T extends { dateCompleted?: string; taskDayOrderIndex?: number },
>(a: T, b: T): number {
  const aDone = isTaskCompletedForDayReorder(a);
  const bDone = isTaskCompletedForDayReorder(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  return (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0);
}
