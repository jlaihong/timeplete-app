/**
 * Shared trackable-attribution helpers — Convex port of productivity-one's
 * `time-window-attribution.utils.ts` and `TrackableTimeWindowGrouper`.
 *
 * The single source of truth for: "which trackable does this time window
 * contribute to?". Every analytics surface that aggregates time per trackable
 * MUST use these helpers so totals stay consistent across screens.
 *
 * The resolution order matches productivity-one exactly:
 *
 *   1. window.trackableId is set                → that trackable
 *   2. window.taskId is set AND task.trackableId → task.trackableId
 *   3. window.taskId is set AND task.listId AND list → trackable link →
 *      list's trackableId
 *
 * Each window matches at most ONE trackable (early-return), so summing per
 * trackable across all windows never double-counts.
 */
import { Doc, Id } from "../_generated/dataModel";
import { toCompactYYYYMMDD } from "./compactYYYYMMDD";

export type TaskInfo = {
  trackableId?: Id<"trackables"> | null;
  listId?: Id<"lists"> | null;
};

/**
 * Build a Map<listId, trackableId> from the listTrackableLinks table rows.
 * The caller is responsible for fetching the rows (typically via the
 * `by_user` index).
 */
export function buildListIdToTrackableId(
  links: Array<Pick<Doc<"listTrackableLinks">, "listId" | "trackableId">>
): Map<string, Id<"trackables">> {
  const m = new Map<string, Id<"trackables">>();
  for (const link of links) {
    m.set(link.listId, link.trackableId);
  }
  return m;
}

/**
 * Build a Map<taskId, TaskInfo> from task documents. Only the fields needed
 * for attribution are kept to keep the map cheap to pass around.
 */
export function buildTaskInfoMap(
  tasks: Array<Doc<"tasks">>
): Map<string, TaskInfo> {
  const m = new Map<string, TaskInfo>();
  for (const t of tasks) {
    m.set(t._id, {
      trackableId: t.trackableId ?? null,
      listId: t.listId ?? null,
    });
  }
  return m;
}

/**
 * Returns the trackable a time window should be attributed to (or `null`
 * if it isn't attributable to any trackable).
 *
 * IMPORTANT: this is the canonical resolver. Do not re-implement this logic
 * inline anywhere — call this function. The order matters because:
 *
 *  - We snapshot trackableId on the window at log time so historical time
 *    stays with the trackable the user was working on (productivity-one
 *    parity, see Scenario 2 in the user spec).
 *  - For windows that lack a snapshot (legacy / external imports / manual
 *    entries) we fall back to the task's CURRENT trackable / list link.
 */
export function resolveAttributedTrackableId(
  tw: Pick<Doc<"timeWindows">, "trackableId" | "taskId">,
  taskInfoMap: Map<string, TaskInfo>,
  listIdToTrackableId: Map<string, Id<"trackables">>
): Id<"trackables"> | null {
  if (tw.trackableId) return tw.trackableId;
  if (!tw.taskId) return null;
  const taskInfo = taskInfoMap.get(tw.taskId);
  if (!taskInfo) return null;
  if (taskInfo.trackableId) return taskInfo.trackableId;
  if (taskInfo.listId) {
    return listIdToTrackableId.get(taskInfo.listId) ?? null;
  }
  return null;
}

/**
 * Predicate: does this window count toward `trackableId`'s totals?
 * Equivalent to `resolveAttributedTrackableId(...) === trackableId` but
 * slightly cheaper because we can short-circuit on the trackableId check.
 */
export function timeWindowAttributedToTrackable(
  tw: Pick<Doc<"timeWindows">, "trackableId" | "taskId">,
  trackableId: Id<"trackables">,
  taskInfoMap: Map<string, TaskInfo>,
  listIdToTrackableId: Map<string, Id<"trackables">>
): boolean {
  if (tw.trackableId === trackableId) return true;
  if (!tw.taskId) return false;
  const taskInfo = taskInfoMap.get(tw.taskId);
  if (!taskInfo) return false;
  if (taskInfo.trackableId === trackableId) return true;
  if (
    taskInfo.listId &&
    listIdToTrackableId.get(taskInfo.listId) === trackableId
  ) {
    return true;
  }
  return false;
}

/**
 * Snapshot resolver used at WRITE time when creating/updating a time window
 * from a task. Returns the trackableId we should stamp on the window.
 *
 * This mirrors `task.store.timer.facade.ts:startTaskTimer` — the trackable
 * is resolved from `task.trackableId` first, then from the task's list
 * via `listTrackableLinks`. The result is persisted on the window so that
 * later reassigning the task to a different trackable does not retroactively
 * move historical time.
 */
export type ResolveOpts = {
  /** task document (or just its attribution-relevant fields) */
  task: TaskInfo | null | undefined;
  /** map listId → trackableId (build with `buildListIdToTrackableId`) */
  listIdToTrackableId: Map<string, Id<"trackables">>;
};

export function resolveSnapshotTrackableIdForTask(
  opts: ResolveOpts
): Id<"trackables"> | undefined {
  const { task, listIdToTrackableId } = opts;
  if (!task) return undefined;
  if (task.trackableId) return task.trackableId;
  if (task.listId) {
    return listIdToTrackableId.get(task.listId) ?? undefined;
  }
  return undefined;
}

/**
 * Pre-aggregates tasks the user marked complete into a
 * `Map<trackableId, Map<dayYYYYMMDD, completedTaskCount>>`. Used by
 * analytics + home queries to add task-driven progress to a
 * trackable's per-day count, mirroring productivity-one's
 * `TrackableDay.completedTaskNames.length` augmentation:
 *
 *  - In P1, `upsertTrackableDayCollection` (`goal.store.helpers.ts:88-108`)
 *    stores `numCompleted = userInput + completedTaskNames.length`.
 *    The "completed task names" list is whatever tasks attributed to
 *    the trackable were marked complete that day.
 *
 *  - When importing supabase data we only carried the *manual*
 *    `numCompleted`; task completions were never folded in. Without
 *    this augmentation, "days a week" trackables whose progress
 *    comes entirely from task completion read as 0.
 *
 * Attribution rule mirrors `resolveSnapshotTrackableIdForTask`:
 * direct `task.trackableId` first, else `task.listId` →
 * `listTrackableLinks` → `trackableId`.
 *
 * Tasks without `dateCompleted` or without an attributable trackable
 * are excluded.
 */
export function buildCompletedTaskCountsByTrackableDay(
  tasks: Array<Doc<"tasks">>,
  listIdToTrackableId: Map<string, Id<"trackables">>
): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>();
  for (const task of tasks) {
    if (!task.dateCompleted) continue;
    const trackableId = resolveSnapshotTrackableIdForTask({
      task: { trackableId: task.trackableId, listId: task.listId },
      listIdToTrackableId,
    });
    if (!trackableId) continue;
    const tid = String(trackableId);
    let dayMap = out.get(tid);
    if (!dayMap) {
      dayMap = new Map<string, number>();
      out.set(tid, dayMap);
    }
    const compactDay = toCompactYYYYMMDD(task.dateCompleted);
    if (!compactDay || compactDay.length !== 8) continue;
    dayMap.set(compactDay, (dayMap.get(compactDay) ?? 0) + 1);
  }
  return out;
}

/**
 * Lookup helper — completed task count for a single
 * (trackableId, day) pair from the map built above. Always returns
 * a non-negative integer.
 */
export function getCompletedTaskCount(
  taskCountsByTrackableDay: Map<string, Map<string, number>>,
  trackableId: Id<"trackables">,
  dayYYYYMMDD: string
): number {
  return (
    taskCountsByTrackableDay
      .get(String(trackableId))
      ?.get(toCompactYYYYMMDD(dayYYYYMMDD)) ?? 0
  );
}

/**
 * Sum-helper — completed task count for a single trackable across a
 * date range (inclusive). Pass `null` for either bound to treat that
 * end as "no limit".
 */
export function sumCompletedTaskCounts(
  taskCountsByTrackableDay: Map<string, Map<string, number>>,
  trackableId: Id<"trackables">,
  fromDayYYYYMMDD: string | null,
  toDayYYYYMMDD: string | null
): number {
  const dayMap = taskCountsByTrackableDay.get(String(trackableId));
  if (!dayMap) return 0;
  const from =
    fromDayYYYYMMDD != null ? toCompactYYYYMMDD(fromDayYYYYMMDD) : null;
  const to = toDayYYYYMMDD != null ? toCompactYYYYMMDD(toDayYYYYMMDD) : null;
  let total = 0;
  for (const [day, count] of dayMap) {
    const cd = toCompactYYYYMMDD(day);
    if (from !== null && cd < from) continue;
    if (to !== null && cd > to) continue;
    total += count;
  }
  return total;
}
