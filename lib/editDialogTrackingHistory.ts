import { toCompactYYYYMMDD } from "../convex/_helpers/compactYYYYMMDD";

/** Minimal time-window shape from `analytics.getTimeBreakdown`. */
export type EditDialogTimeWindow = {
  startDayYYYYMMDD: string;
  durationSeconds: number;
  source?: string | null;
  trackableId?: string | null;
  taskId?: string | null;
  budgetType?: string;
};

export function labelForEditDialogTimeSource(key: string): string {
  switch (key) {
    case "timer":
      return "Timer";
    case "manual":
      return "Manual entry";
    case "calendar":
      return "Calendar";
    case "tracker_entry":
      return "Tracker";
    default:
      return key;
  }
}

function resolveWindowTrackableId(
  w: Pick<EditDialogTimeWindow, "trackableId" | "taskId">,
  tasks: Record<string, { trackableId?: string; listId?: string } | undefined>,
  listIdToTrackableId: Record<string, string>
): string | null {
  if (w.trackableId) return w.trackableId;
  if (!w.taskId) return null;
  const task = tasks[w.taskId];
  if (!task) return null;
  if (task.trackableId) return task.trackableId;
  if (task.listId) return listIdToTrackableId[task.listId] ?? null;
  return null;
}

/**
 * Edit-dialog "time by source" breakdown using the same attribution + date
 * rules as `trackables:getEditDialogTrackingHistory` (client-side composition
 * of `analytics.getTimeBreakdown` so the UI works before that query is
 * deployed).
 */
export function buildEditDialogTimeBySource(opts: {
  trackableId: string;
  trackableType: "TIME_TRACK" | "MINUTES_A_WEEK" | "TRACKER";
  startDayYYYYMMDD?: string;
  endDayYYYYMMDD?: string;
  windows: EditDialogTimeWindow[];
  tasks: Record<string, { trackableId?: string; listId?: string } | undefined>;
  listIdToTrackableId: Record<string, string>;
  /** Sum of tracker-entry durations (TRACKER only). */
  trackerEntryDurationSeconds?: number;
}): Array<{ source: string; label: string; seconds: number }> {
  const compactStart =
    opts.trackableType !== "TRACKER"
      ? toCompactYYYYMMDD(opts.startDayYYYYMMDD)
      : "";
  const compactEnd =
    opts.trackableType !== "TRACKER"
      ? toCompactYYYYMMDD(opts.endDayYYYYMMDD)
      : "";

  const buckets = new Map<string, number>();

  for (const w of opts.windows) {
    if (w.budgetType !== "ACTUAL") continue;
    const wDay = toCompactYYYYMMDD(w.startDayYYYYMMDD);
    if (opts.trackableType !== "TRACKER") {
      if (compactStart && wDay && wDay < compactStart) continue;
      if (compactEnd && wDay && wDay > compactEnd) continue;
    }
    const attributed = resolveWindowTrackableId(
      w,
      opts.tasks,
      opts.listIdToTrackableId
    );
    if (attributed !== opts.trackableId) continue;
    const raw = w.source ?? "timer";
    buckets.set(raw, (buckets.get(raw) ?? 0) + w.durationSeconds);
  }

  const entrySecs = opts.trackerEntryDurationSeconds ?? 0;
  if (entrySecs > 0 && opts.trackableType === "TRACKER") {
    buckets.set(
      "tracker_entry",
      (buckets.get("tracker_entry") ?? 0) + entrySecs
    );
  }

  return [...buckets.entries()]
    .filter(([, sec]) => sec > 0)
    .map(([source, seconds]) => ({
      source,
      label: labelForEditDialogTimeSource(source),
      seconds,
    }))
    .sort((a, b) => b.seconds - a.seconds);
}
