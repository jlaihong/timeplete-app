/**
 * Optimistic local updates when `timers.stop` runs: clear the active timer
 * query immediately, (for task timers) bump cached per-task time by the
 * elapsed slice, and patch open `timeWindows.search` subscriptions so the
 * calendar shows the new block without waiting for a server round-trip.
 */
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { applyTimeSpentDeltaOptimisticUpdate } from "./setTimeSpentOptimisticUpdate";
import { wallClockInTimeZone } from "./wallClockTimeZone";
import { DEFAULT_EVENT_COLOR } from "./eventColors";

type TimerSnapshot = NonNullable<FunctionReturnType<typeof api.timers.get>>;

type TimeWindowSearchRow = NonNullable<
  FunctionReturnType<typeof api.timeWindows.search>
>[number];

/** Stable id so repeated optimistic patches replace the same placeholder row. */
const OPTIMISTIC_TIMER_WINDOW_ID =
  "__optimistic_timer_window__" as Id<"timeWindows">;

function patchTimeWindowsSearchForCalendar(
  localStore: OptimisticLocalStore,
  day: string,
  row: TimeWindowSearchRow,
): void {
  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const args = q.args as {
      startDay?: string;
      endDay?: string;
      taskId?: Id<"tasks">;
      trackableId?: Id<"trackables">;
      budgetType?: string;
      activityType?: string;
    };
    if (args.taskId != null || args.trackableId != null) continue;
    if (typeof args.startDay !== "string" || typeof args.endDay !== "string") {
      continue;
    }
    if (day < args.startDay || day > args.endDay) continue;
    if (args.budgetType != null && args.budgetType !== "ACTUAL") continue;
    if (
      args.activityType != null &&
      args.activityType !== row.activityType
    ) {
      continue;
    }
    const prev = (q.value ?? []) as TimeWindowSearchRow[];
    const without = prev.filter((w) => w._id !== OPTIMISTIC_TIMER_WINDOW_ID);
    const next = [...without, row].sort((a, b) =>
      a.startTimeHHMM.localeCompare(b.startTimeHHMM),
    );
    localStore.setQuery(api.timeWindows.search, q.args, next);
  }
}

export function applyStopTimerOptimisticUpdate(
  localStore: OptimisticLocalStore,
): void {
  let snapshot: TimerSnapshot | null = null;
  for (const q of localStore.getAllQueries(api.timers.get)) {
    if (q.value) {
      snapshot = q.value as TimerSnapshot;
      break;
    }
  }
  if (!snapshot) return;

  const elapsed = Math.floor((Date.now() - snapshot.startTime) / 1000);
  if (elapsed > 0) {
    if (snapshot.taskId) {
      applyTimeSpentDeltaOptimisticUpdate(
        localStore,
        snapshot.taskId as Id<"tasks">,
        elapsed,
      );
    }

    const { startDayYYYYMMDD: day, startTimeHHMM } = wallClockInTimeZone(
      snapshot.startTime,
      snapshot.timeZone,
    );
    const activityType = snapshot.taskId ? ("TASK" as const) : ("TRACKABLE" as const);
    const label =
      snapshot.displayTitle?.trim() ||
      (activityType === "TASK" ? "Task" : "Trackable");
    const row = {
      _id: OPTIMISTIC_TIMER_WINDOW_ID,
      _creationTime: Date.now(),
      startTimeHHMM,
      startDayYYYYMMDD: day,
      durationSeconds: elapsed,
      userId: snapshot.userId,
      budgetType: "ACTUAL" as const,
      activityType,
      taskId: snapshot.taskId,
      trackableId: snapshot.trackableId,
      timeZone: snapshot.timeZone,
      isRecurringInstance: false,
      source: "timer" as const,
      displayTitle: label,
      derivedTitle: label,
      displayColor: snapshot.displayColor ?? DEFAULT_EVENT_COLOR,
      secondaryColor: snapshot.secondaryColor,
    } as TimeWindowSearchRow;

    patchTimeWindowsSearchForCalendar(localStore, day, row);
  }

  for (const q of localStore.getAllQueries(api.timers.get)) {
    localStore.setQuery(api.timers.get, q.args, null);
  }
}
