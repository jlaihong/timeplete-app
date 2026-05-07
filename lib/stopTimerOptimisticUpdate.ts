/**
 * Optimistic local updates when `timers.stop` runs: clear the active timer
 * query immediately and (for task timers) bump cached per-task time by the
 * elapsed slice so totals don't dip before the mutation ack.
 */
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { applyTimeSpentDeltaOptimisticUpdate } from "./setTimeSpentOptimisticUpdate";

type TimerSnapshot = NonNullable<FunctionReturnType<typeof api.timers.get>>;

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
  if (snapshot.taskId && elapsed > 0) {
    applyTimeSpentDeltaOptimisticUpdate(
      localStore,
      snapshot.taskId as Id<"tasks">,
      elapsed,
    );
  }

  for (const q of localStore.getAllQueries(api.timers.get)) {
    localStore.setQuery(api.timers.get, q.args, null);
  }
}
