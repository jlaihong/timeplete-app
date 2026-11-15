/**
 * Shared trackable-attribution helpers — Convex port of productivity-one's
 * `time-window-attribution.utils.ts` and `TrackableTimeWindowGrouper`.
 *
 * The single source of truth for: "which trackable does this time window
 * contribute to?". Every analytics surface that aggregates time per trackable
 * MUST use these helpers so totals stay consistent across screens.
 *
 * A window or task can count toward SEVERAL trackables: its tags, the
 * rules that match it, and every ancestor of those. That set is resolved
 * and stamped on the row (`attributedTrackableIds`) by
 * `trackableMembership.ts` / `trackableLifetime.ts`; the helpers here
 * read the stamp, and fall back to the older single-trackable rule
 *
 *   1. window.trackableId is set                → that trackable
 *   2. window.taskId is set                       → task.trackableId, else
 *      task.listId → listTrackableLinks → trackableId
 *   3. window.listId only (calendar EVENT / legacy rows) → listTrackableLinks
 *
 * for rows that have not been stamped yet.
 */
import { Doc, Id } from "../_generated/dataModel";
import { toCompactYYYYMMDD } from "./compactYYYYMMDD";

export type TaskInfo = {
  trackableId?: Id<"trackables"> | null;
  listId?: Id<"lists"> | null;
  /** The task's stamp, when it has one (see `tasks.attributedTrackableIds`). */
  attributedTrackableIds?: Id<"trackables">[] | null;
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
      attributedTrackableIds: t.attributedTrackableIds ?? null,
    });
  }
  return m;
}

/**
 * Returns the trackable a time window should be grouped under for display
 * (single-bucket resolution). Matches productivity-one's
 * `TrackableTimeWindowGrouper.resolveEffectiveTrackableId`:
 * coalesce(window.trackableId, task.trackableId, list link).
 *
 * For filtering whether a window counts toward a *specific* trackable's
 * totals, use `timeWindowAttributedToTrackable` instead — that mirrors
 * productivity-one's union attribution predicate and also counts windows
 * whose task is currently assigned to the trackable even when the window
 * snapshot points elsewhere.
 */
export function resolveAttributedTrackableId(
  tw: Pick<Doc<"timeWindows">, "trackableId" | "taskId" | "listId"> &
    Partial<Pick<Doc<"timeWindows">, "attributedTrackableIds">>,
  taskInfoMap: Map<string, TaskInfo>,
  listIdToTrackableId: Map<string, Id<"trackables">>
): Id<"trackables"> | null {
  // A window can count toward several trackables (tags, rules, their
  // ancestors). Where one is needed — a colour, a single bucket — it is
  // the first tag: the stamp lists tags first, ancestors after.
  if (tw.attributedTrackableIds) return tw.attributedTrackableIds[0] ?? null;
  if (tw.trackableId) return tw.trackableId;
  if (tw.taskId) {
    const taskInfo = taskInfoMap.get(tw.taskId);
    if (taskInfo) {
      if (taskInfo.trackableId) return taskInfo.trackableId;
      if (taskInfo.listId) {
        return listIdToTrackableId.get(taskInfo.listId) ?? null;
      }
    }
  }
  if (tw.listId) {
    return listIdToTrackableId.get(tw.listId) ?? null;
  }
  return null;
}

/**
 * Predicate: does this window count toward `trackableId`'s totals?
 *
 * Matches productivity-one `time-window-attribution.utils.ts` and the
 * backend `get_time_track_sums` OR filter: a window counts when ANY of
 * these hold:
 *   1. window.trackableId === trackableId (write-time snapshot)
 *   2. task.trackableId === trackableId (current direct assignment)
 *   3. task.listId → listTrackableLinks === trackableId
 */
export function timeWindowAttributedToTrackable(
  tw: Pick<Doc<"timeWindows">, "trackableId" | "taskId" | "listId"> &
    Partial<Pick<Doc<"timeWindows">, "attributedTrackableIds">>,
  trackableId: Id<"trackables">,
  taskInfoMap: Map<string, TaskInfo>,
  listIdToTrackableId: Map<string, Id<"trackables">>
): boolean {
  const tid = String(trackableId);
  // Stamped rows carry the full answer (tags, rules, ancestors). The
  // rest of this function is the old rule, for rows not yet stamped.
  if (tw.attributedTrackableIds) {
    return tw.attributedTrackableIds.some((id) => String(id) === tid);
  }
  if (tw.trackableId && String(tw.trackableId) === tid) return true;
  if (!tw.taskId) return false;
  const taskInfo = taskInfoMap.get(String(tw.taskId));
  if (!taskInfo) return false;
  if (taskInfo.trackableId && String(taskInfo.trackableId) === tid) {
    return true;
  }
  if (taskInfo.listId) {
    const linked = listIdToTrackableId.get(String(taskInfo.listId));
    if (linked && String(linked) === tid) return true;
  }
  return false;
}

/**
 * All trackable IDs that should receive lifetime credit for an ACTUAL window.
 * Matches the union of paths checked by `timeWindowAttributedToTrackable`:
 * window snapshot, task direct assignment, and task list link.
 */
export function unionLifetimeTrackableIds(
  tw: Pick<
    Doc<"timeWindows">,
    "trackableId" | "taskId" | "budgetType"
  >,
  taskInfo: TaskInfo | null | undefined,
  listIdToTrackableId: Map<string, Id<"trackables">>,
): Id<"trackables">[] {
  if (tw.budgetType !== "ACTUAL") return [];
  const ids = new Set<string>();
  if (tw.trackableId) ids.add(String(tw.trackableId));
  if (tw.taskId && taskInfo) {
    if (taskInfo.trackableId) ids.add(String(taskInfo.trackableId));
    if (taskInfo.listId) {
      const linked = listIdToTrackableId.get(String(taskInfo.listId));
      if (linked) ids.add(String(linked));
    }
  }
  return Array.from(ids) as Id<"trackables">[];
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
    const compactDay = toCompactYYYYMMDD(task.dateCompleted);
    if (!compactDay || compactDay.length !== 8) continue;
    for (const trackableId of taskAttributedTrackableIds(
      task,
      listIdToTrackableId,
    )) {
      const tid = String(trackableId);
      let dayMap = out.get(tid);
      if (!dayMap) {
        dayMap = new Map<string, number>();
        out.set(tid, dayMap);
      }
      dayMap.set(compactDay, (dayMap.get(compactDay) ?? 0) + 1);
    }
  }
  return out;
}

/**
 * Every trackable a task counts toward: its stamp when it has one, else
 * the old single-trackable rule (its tag, else its list's trackable).
 */
export function taskAttributedTrackableIds(
  task: Pick<Doc<"tasks">, "trackableId" | "listId" | "attributedTrackableIds">,
  listIdToTrackableId: Map<string, Id<"trackables">>,
): Id<"trackables">[] {
  if (task.attributedTrackableIds) return task.attributedTrackableIds;
  const single = resolveSnapshotTrackableIdForTask({
    task: { trackableId: task.trackableId, listId: task.listId },
    listIdToTrackableId,
  });
  return single ? [single] : [];
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
 * Anchor day used by per-day / per-week / per-month averages.
 *
 * We use the FIRST DAY this trackable saw any activity (timer window,
 * manual tracker entry with a real value, or a `trackableDays` row with
 * `numCompleted > 0`) instead of `trackable.startDayYYYYMMDD`.
 *
 * Why: `startDayYYYYMMDD` is a *user-set* milestone. Time windows can
 * legitimately exist *before* it because productivity-one back-fills
 * historical task time onto a Trackable that was created later (union
 * attribution: `tw.taskId → task.list → listTrackableLinks`). When that
 * happens, dividing by `(today - startDay)` over-weights the average
 * because the numerator includes hours the denominator excludes.
 *
 * If there's been no activity at all we fall back to
 * `fallbackStartDay` so the formula still produces a finite, non-zero
 * denominator for brand-new trackables.
 *
 * All inputs MUST be in compact `YYYYMMDD` form (use
 * `toCompactYYYYMMDD` first if you have dashed dates).
 */
export function firstActivityDayYYYYMMDD(opts: {
  attributedWindows: Array<{ startDayYYYYMMDD: string }>;
  trackerEntries: Array<{
    dayYYYYMMDD: string;
    countValue?: number;
    durationSeconds?: number;
  }>;
  trackableDays: Array<{ dayYYYYMMDD: string; numCompleted: number }>;
  fallbackStartDay: string;
}): string {
  let earliest: string | null = null;
  for (const w of opts.attributedWindows) {
    const d = w.startDayYYYYMMDD;
    if (!d) continue;
    if (earliest === null || d < earliest) earliest = d;
  }
  for (const e of opts.trackerEntries) {
    const d = e.dayYYYYMMDD;
    if (!d) continue;
    // Only count entries that actually contribute to a total.
    if ((e.countValue ?? 0) <= 0 && (e.durationSeconds ?? 0) <= 0) continue;
    if (earliest === null || d < earliest) earliest = d;
  }
  for (const td of opts.trackableDays) {
    const d = td.dayYYYYMMDD;
    if (!d) continue;
    if (td.numCompleted <= 0) continue;
    if (earliest === null || d < earliest) earliest = d;
  }
  return earliest ?? opts.fallbackStartDay;
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
