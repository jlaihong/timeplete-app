import { useMemo, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./useAuth";

const DAY_KEY = /^\d{8}$/;

/**
 * Time logged against each task on each day, for the home list.
 *
 * Home groups tasks by day, so a row shows what was spent on the task on
 * *that* day rather than the task's running total (list pages show the
 * total). The numbers come from the same `timeWindows.search` rows the
 * calendar draws, which means the timer-stop and edit-time optimistic
 * patches reach this too.
 *
 * `groupIds` are the list's group keys; anything that is not a day
 * ("unscheduled") is ignored. Returns `secondsFor(taskId, day)`, which is
 * `undefined` for a non-day group so callers can fall back to the total.
 */
export function useTaskDaySeconds(groupIds: readonly string[]) {
  const { profileReady } = useAuth();

  let startDay: string | null = null;
  let endDay: string | null = null;
  for (const id of groupIds) {
    if (!DAY_KEY.test(id)) continue;
    if (startDay === null || id < startDay) startDay = id;
    if (endDay === null || id > endDay) endDay = id;
  }

  const windows = useQuery(
    api.timeWindows.search,
    profileReady && startDay && endDay
      ? { startDay, endDay, budgetType: "ACTUAL", activityType: "TASK" }
      : "skip",
  );

  // Widening the range (load more, older overdue days) re-subscribes and
  // briefly returns `undefined`; keep the last rows so times don't blink.
  const lastWindowsRef = useRef(windows);
  if (windows !== undefined) lastWindowsRef.current = windows;
  const stableWindows = windows ?? lastWindowsRef.current;

  return useMemo(() => {
    const byTaskDay = new Map<string, number>();
    for (const w of stableWindows ?? []) {
      if (!w.taskId) continue;
      const key = `${w.taskId}|${w.startDayYYYYMMDD}`;
      byTaskDay.set(key, (byTaskDay.get(key) ?? 0) + (w.durationSeconds ?? 0));
    }
    return (taskId: string, day: string): number | undefined =>
      DAY_KEY.test(day) ? (byTaskDay.get(`${taskId}|${day}`) ?? 0) : undefined;
  }, [stableWindows]);
}
