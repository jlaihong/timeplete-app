/**
 * Compose Edit Trackable “Tracking history” from existing Convex queries so the
 * dialog works against backends that have not deployed a dedicated history API.
 * Mirrors attribution + title rules from `convex/_helpers/timeWindowDisplayEnrichment.ts`.
 */
import type { Doc, Id } from "../convex/_generated/dataModel";

type TW = Doc<"timeWindows">;

export type EditDialogMergedHistoryRow =
  | {
      kind: "time_window";
      _id: string;
      sortKey: string;
      startDayYYYYMMDD: string;
      startTimeHHMM: string;
      durationSeconds: number;
      displayTitle: string;
      source: "timer" | "manual" | "calendar" | "tracker_entry";
      comments?: string;
    }
  | {
      kind: "tracker_entry";
      _id: string;
      sortKey: string;
      dayYYYYMMDD: string;
      startTimeHHMM?: string;
      durationSeconds?: number | null;
      countValue?: number | null;
      comments?: string | null;
    };

type TaskSubset = Doc<"tasks">;
type ListSubset = Doc<"lists">;
type TrackableSubset = Doc<"trackables">;

/** Matches `analytics.getTimeBreakdown` payload used for edit history. */
export type AnalyticsBreakdownSubset = {
  timeWindows: TW[];
  tasks: Record<string, TaskSubset>;
  lists: Record<string, ListSubset>;
  trackables: Record<string, TrackableSubset>;
  listIdToTrackableId: Record<string, string>;
};

function mapById<T extends { _id: string }>(
  records: Record<string, T | undefined>,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const t of Object.values(records)) {
    if (t) m.set(String(t._id), t);
  }
  return m;
}

function taskAttributionMap(
  tasks: Record<string, TaskSubset | undefined>,
): Map<string, { trackableId?: Id<"trackables"> | null; listId?: Id<"lists"> | null }> {
  const m = new Map();
  for (const t of Object.values(tasks)) {
    if (!t) continue;
    m.set(String(t._id), {
      trackableId: t.trackableId ?? null,
      listId: t.listId ?? null,
    });
  }
  return m;
}

function linkMap(
  listIdToTrackableId: Record<string, string>,
): Map<string, Id<"trackables">> {
  const m = new Map<string, Id<"trackables">>();
  for (const [lid, tid] of Object.entries(listIdToTrackableId)) {
    m.set(lid, tid as Id<"trackables">);
  }
  return m;
}

function resolveAttributedTrackableIdClient(
  tw: Pick<TW, "trackableId" | "taskId">,
  taskMap: Map<
    string,
    {
      trackableId?: Id<"trackables"> | null;
      listId?: Id<"lists"> | null;
    }
  >,
  listIdToTrackableId: Map<string, Id<"trackables">>,
): string | null {
  if (tw.trackableId) return String(tw.trackableId);
  if (!tw.taskId) return null;
  const task = taskMap.get(String(tw.taskId));
  if (!task) return null;
  if (task.trackableId) return String(task.trackableId);
  if (task.listId) {
    const tgt = listIdToTrackableId.get(String(task.listId));
    return tgt ? String(tgt) : null;
  }
  return null;
}

function windowAttributedToTrackableClient(
  tw: Pick<TW, "trackableId" | "taskId">,
  trackableId: string,
  taskMap: Map<
    string,
    {
      trackableId?: Id<"trackables"> | null;
      listId?: Id<"lists"> | null;
    }
  >,
  listIdToTrackableId: Map<string, Id<"trackables">>,
): boolean {
  return resolveAttributedTrackableIdClient(tw, taskMap, listIdToTrackableId) === trackableId;
}

function displayTitleForEditHistoryWindow(
  w: TW,
  tasksById: Map<string, TaskSubset>,
  listsById: Map<string, ListSubset>,
  trackablesById: Map<string, TrackableSubset>,
): string {
  let derivedTitle: string | undefined;
  const directListDoc = w.listId ? listsById.get(String(w.listId)) : undefined;

  if (w.activityType === "EVENT") {
    const eventTrackable = w.trackableId
      ? trackablesById.get(String(w.trackableId))
      : undefined;
    if (directListDoc?.name) derivedTitle = directListDoc.name;
    else if (eventTrackable?.name) derivedTitle = eventTrackable.name;
  } else if (w.activityType === "TRACKABLE" && w.trackableId) {
    const trackable = trackablesById.get(String(w.trackableId));
    if (directListDoc?.name) derivedTitle = directListDoc.name;
    else if (trackable?.name) derivedTitle = trackable.name;
  } else if (w.activityType === "TASK") {
    const task = w.taskId ? tasksById.get(String(w.taskId)) : undefined;
    const taskListDoc = task?.listId ? listsById.get(String(task.listId)) : undefined;
    if (task?.name) derivedTitle = task.name;
    else if (directListDoc?.name) derivedTitle = directListDoc.name;
    else if (taskListDoc?.name) derivedTitle = taskListDoc.name;
  }

  const fallback = w.activityType === "EVENT" ? "Event" : "Untitled";
  return w.title ?? derivedTitle ?? fallback;
}

/** YYYYMMDD digits only */
function compactDay(d: string): string {
  return d.replace(/\D/g, "").slice(0, 8);
}

export function buildEditDialogMergedHistory(opts: {
  trackableId: string;
  trackableType: "TIME_TRACK" | "MINUTES_A_WEEK" | "TRACKER";
  trackTime: boolean;
  timeBreakdown: AnalyticsBreakdownSubset | null | undefined;
  trackerSearch:
    | { entries: Doc<"trackerEntries">[] }
    | null
    | undefined;
}): EditDialogMergedHistoryRow[] {
  const rows: EditDialogMergedHistoryRow[] = [];

  const wantsWindows =
    !!opts.timeBreakdown &&
    (opts.trackableType !== "TRACKER" || opts.trackTime);

  if (wantsWindows && opts.timeBreakdown) {
    const bd = opts.timeBreakdown;
    const taskAttr = taskAttributionMap(bd.tasks);
    const listToTrackable = linkMap(bd.listIdToTrackableId);
    const tasksById = mapById(bd.tasks as Record<string, TaskSubset>);
    const listsById = mapById(bd.lists as Record<string, ListSubset>);
    const trackablesById = mapById(bd.trackables as Record<string, TrackableSubset>);

    for (const w of bd.timeWindows) {
      if (!windowAttributedToTrackableClient(w, opts.trackableId, taskAttr, listToTrackable)) {
        continue;
      }
      const displayTitle = displayTitleForEditHistoryWindow(
        w,
        tasksById,
        listsById,
        trackablesById,
      );
      const src = (w.source ?? "timer") as
        | "timer"
        | "manual"
        | "calendar"
        | "tracker_entry";

      rows.push({
        kind: "time_window",
        _id: String(w._id),
        sortKey: `${w.startDayYYYYMMDD}\u0001${w.startTimeHHMM}\u0001${w._id}`,
        startDayYYYYMMDD: w.startDayYYYYMMDD,
        startTimeHHMM: w.startTimeHHMM,
        durationSeconds: w.durationSeconds,
        displayTitle,
        source: src,
        comments: w.comments,
      });
    }
  }

  if (opts.trackableType === "TRACKER" && opts.trackerSearch?.entries) {
    for (const e of opts.trackerSearch.entries) {
      const day = compactDay(e.dayYYYYMMDD);
      rows.push({
        kind: "tracker_entry",
        _id: String(e._id),
        sortKey: `${day}\u0001${e.startTimeHHMM ?? ""}\u0001${e._id}`,
        dayYYYYMMDD: e.dayYYYYMMDD,
        startTimeHHMM: e.startTimeHHMM,
        durationSeconds: e.durationSeconds ?? null,
        countValue: e.countValue ?? null,
        comments: e.comments ?? null,
      });
    }
  }

  rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));

  return rows;
}

/**
 * Productivity-one `TrackerDetailsDialog` history rows (`HistoryRow`): merged tracker
 * entries + attributed time windows, sorted by day desc then start time desc.
 */
export type TrackerDetailsHistoryRow =
  | {
      source: "tracker_entry";
      id: string;
      sortKey: string;
      dayYYYYMMDD: string;
      startTimeHHMM?: string | null;
      durationSeconds?: number | null;
      countValue?: number | null;
      comments?: string | null;
    }
  | {
      source: "time_window";
      id: string;
      sortKey: string;
      startDayYYYYMMDD: string;
      startTimeHHMM: string;
      durationSeconds: number;
      /** Mirrors productivity-one Comments: `tw.title || tw.comments`, then resolved label (task name, etc.). */
      commentsUnified: string;
      /** Present when trackCount && autoCountFromCalendar (value `1`). */
      syntheticCount?: number;
    };

/** Match `tracker-details-dialog.ts:formatDuration`: `hours` + `:MM` minutes of hour only. */
export function formatTrackerDialogDuration(seconds?: number | null): string {
  if (seconds === undefined || seconds === null || seconds <= 0) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

export function mergeTrackerDetailsHistory(opts: {
  trackableId: string;
  trackCount: boolean;
  autoCountFromCalendar: boolean;
  timeBreakdown: AnalyticsBreakdownSubset | null | undefined;
  trackerEntries: Doc<"trackerEntries">[];
}): TrackerDetailsHistoryRow[] {
  const trackerEntryIds = new Set(
    opts.trackerEntries.map((e) => String(e._id)).filter(Boolean),
  );

  const rows: TrackerDetailsHistoryRow[] = [];

  if (opts.timeBreakdown?.timeWindows?.length) {
    const bd = opts.timeBreakdown;
    const taskAttr = taskAttributionMap(bd.tasks);
    const listToTrackable = linkMap(bd.listIdToTrackableId);

    const attributed: TW[] = [];
    for (const w of bd.timeWindows) {
      if (
        !windowAttributedToTrackableClient(
          w,
          opts.trackableId,
          taskAttr,
          listToTrackable,
        )
      ) {
        continue;
      }
      attributed.push(w);
    }

    const tasksById = mapById(bd.tasks as Record<string, TaskSubset>);
    const listsById = mapById(bd.lists as Record<string, ListSubset>);
    const trackablesById = mapById(bd.trackables as Record<string, TrackableSubset>);

    for (const tw of attributed) {
      const src = tw.source ?? "timer";
      // productivity-one: keep `time_window`-sourced rows always; omit `tracker_entry`
      // windows whose id duplicates a fetched manual tracker row.
      // Convex only types `tracker_entry`/`timer`/…; omit non-legacy overlaps defensively.
      if (src === "tracker_entry" && trackerEntryIds.has(String(tw._id))) {
        continue;
      }

      const titleTrim =
        typeof tw.title === "string" && tw.title.trim().length > 0
          ? tw.title.trim()
          : undefined;
      const commentsTrim =
        typeof tw.comments === "string" && tw.comments.trim().length > 0
          ? tw.comments.trim()
          : undefined;

      const twSansCaption = { ...tw, title: undefined, comments: undefined } as TW;

      const derivedLabel = displayTitleForEditHistoryWindow(
        twSansCaption,
        tasksById,
        listsById,
        trackablesById,
      );

      const commentsUnified = titleTrim ?? commentsTrim ?? derivedLabel;
      rows.push({
        source: "time_window",
        id: String(tw._id),
        sortKey: `${tw.startDayYYYYMMDD}\u0001${tw.startTimeHHMM ?? ""}\u0001${tw._id}`,
        startDayYYYYMMDD: tw.startDayYYYYMMDD,
        startTimeHHMM: tw.startTimeHHMM,
        durationSeconds: tw.durationSeconds,
        commentsUnified,
        syntheticCount:
          opts.trackCount && opts.autoCountFromCalendar ? 1 : undefined,
      });
    }
  }

  for (const e of opts.trackerEntries) {
    const day = compactDay(e.dayYYYYMMDD);
    rows.push({
      source: "tracker_entry",
      id: String(e._id),
      sortKey: `${day}\u0001${e.startTimeHHMM ?? ""}\u0001${e._id}`,
      dayYYYYMMDD: e.dayYYYYMMDD,
      startTimeHHMM: e.startTimeHHMM,
      durationSeconds: e.durationSeconds ?? null,
      countValue: e.countValue ?? null,
      comments: e.comments ?? null,
    });
  }

  rows.sort((a, b) => (a.sortKey < b.sortKey ? 1 : a.sortKey > b.sortKey ? -1 : 0));

  return rows;
}


