/**
 * Overdue windowing for the home task list.
 *
 * The Overdue group only shows tasks scheduled within the last
 * `OVERDUE_WINDOW_DAYS` days. Anything older stays hidden behind a
 * "Load previous week" button so a few neglected days cannot bury today.
 */
import { addDays } from "./dates";

export const OVERDUE_WINDOW_DAYS = 7;

/** Oldest scheduled day that is still shown, for `weeksLoaded` weeks back. */
export function overdueCutoffDay(anchorDay: string, weeksLoaded: number): string {
  return addDays(anchorDay, -OVERDUE_WINDOW_DAYS * Math.max(1, weeksLoaded));
}

export function splitOverdueByCutoff<T extends { taskDay?: string }>(
  overdueTasks: readonly T[],
  cutoffDay: string,
): { visible: T[]; hiddenCount: number; newestHiddenDay: string | null } {
  const visible: T[] = [];
  let hiddenCount = 0;
  let newestHiddenDay: string | null = null;
  for (const task of overdueTasks) {
    const day = task.taskDay;
    if (!day || day >= cutoffDay) {
      visible.push(task);
      continue;
    }
    hiddenCount += 1;
    if (newestHiddenDay === null || day > newestHiddenDay) newestHiddenDay = day;
  }
  return { visible, hiddenCount, newestHiddenDay };
}

/**
 * How many weeks to have loaded after one tap on "Load previous week".
 * Steps back one week, but skips over empty weeks so a tap always reveals
 * at least one task.
 */
export function nextOverdueWeeksLoaded(
  anchorDay: string,
  weeksLoaded: number,
  newestHiddenDay: string | null,
): number {
  let next = Math.max(1, weeksLoaded) + 1;
  if (newestHiddenDay === null) return next;
  // Bounded: 520 weeks = 10 years of neglected tasks.
  while (next < 520 && newestHiddenDay < overdueCutoffDay(anchorDay, next)) {
    next += 1;
  }
  return next;
}
