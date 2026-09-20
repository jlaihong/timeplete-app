/**
 * Home / today-list order. Must match productivity-one `compareTasksForDay`
 * and the client (`DesktopTaskList` / `TaskList`): incomplete first, then
 * `taskDayOrderIndex`.
 *
 * Display sort only. A move persists a position in this order, not the
 * `taskDayOrderIndex` arithmetic that produced it.
 *
 * `taskDayOrderIndex` is not unique per day: the Supabase migration wrote
 * `COALESCE(task_day_order_index, 0)` and recurring instances are created
 * at the day's end but can still collide. Ties therefore break on
 * `_creationTime` so the client and the mutation agree on one order; a
 * stable sort alone would not, because they read the rows from different
 * queries.
 */
export function isTaskCompletedForDayReorder(t: {
  dateCompleted?: string;
}): boolean {
  const d = t.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

export function compareTasksForDay<
  T extends {
    dateCompleted?: string;
    taskDayOrderIndex?: number;
    _creationTime?: number;
  },
>(a: T, b: T): number {
  const aDone = isTaskCompletedForDayReorder(a);
  const bDone = isTaskCompletedForDayReorder(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  const byOrder = (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0);
  if (byOrder !== 0) return byOrder;
  return (a._creationTime ?? 0) - (b._creationTime ?? 0);
}
