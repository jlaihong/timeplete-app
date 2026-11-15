import {
  formatTimeWindowWedgeLabel,
  formatYYYYMMDDForDisplay,
  timeWindowBoundsMs,
} from "./dates";
import { plainMentions } from "./mentions";

export type TimeWindowLike = {
  startDayYYYYMMDD: string;
  durationSeconds: number;
  activityType: string;
  startTimeHHMM?: string;
  /** Convex document id — one `time_window` wedge per row (Productivity-One). */
  _id?: string;
  taskId?: string | null;
  trackableId?: string | null;
  /**
   * Every trackable the window counts toward: the ones it is allocated to
   * or matched by a rule, then their ancestors.
   */
  attributedTrackableIds?: string[] | null;
  listId?: string | null;
};

export type GroupByMode =
  | "task"
  | "list"
  /** The top of the trackable tree: "Social", "Work". */
  | "trackable"
  /** The second and third levels of the tree: "Family", "MSA project". */
  | "trackable_2"
  | "trackable_3"
  | "date"
  | "day_of_week"
  | "month"
  | "year"
  /** One segment per logged time window (not bucketed by hour/day/month). */
  | "time_window";

export interface GroupedResult {
  key: string;
  label: string;
  totalSeconds: number;
  count: number;
  colour?: string;
}

export interface GroupedBucket extends GroupedResult {
  /** Windows that contributed to this bucket (for drill-down). */
  windows: TimeWindowLike[];
}

export type TrackableTypeLite =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

export interface GroupingLookups {
  tasks?: Record<
    string,
    {
      name?: string;
      listId?: string;
      trackableId?: string;
    }
  >;
  lists?: Record<string, { name: string; colour: string }>;
  trackables?: Record<
    string,
    {
      name: string;
      colour: string;
      trackableType?: TrackableTypeLite;
      /** Path from the top of the tree down to the parent. */
      ancestorIds?: string[];
    }
  >;
  listIdToTrackableId?: Record<string, string>;
  /** Union attribution for trackable — matches `useAnalyticsDataset.resolveTrackableId`. */
  resolveTrackableId?: (w: TimeWindowLike) => string | null;
  /** Active analytics tab — used for time-window wedge labels (date vs time-only). */
  analyticsTab?: string;
}

function resolvedTrackableId(
  w: TimeWindowLike,
  lookups: GroupingLookups
): string | null {
  if (lookups.resolveTrackableId) return lookups.resolveTrackableId(w);
  if (w.trackableId) return w.trackableId;
  if (w.taskId) {
    const task = lookups.tasks?.[w.taskId];
    if (task) {
      if (task.trackableId) return task.trackableId;
      if (task.listId && lookups.listIdToTrackableId) {
        return lookups.listIdToTrackableId[task.listId] ?? null;
      }
    }
  }
  if (w.listId && lookups.listIdToTrackableId) {
    return lookups.listIdToTrackableId[w.listId] ?? null;
  }
  return null;
}

const NO_TRACKABLE = { key: "no_trackable", label: "No trackable" };

/**
 * Where a window falls at one level of the trackable tree (1 = top).
 *
 * A window can count toward several trackables. So that a ring still adds
 * up to its total, a window in more than one branch gets a slice of its
 * own, named after all of them:
 *
 *   allocated to Family and Friends (both under Social)
 *     level 1 → "Social"            (once, not twice)
 *     level 2 → "Family + Friends"  (its own slice beside "Family")
 *
 * A window whose trackable stops above this level (allocated to Social
 * itself) is "Social directly" at level 2.
 */
function trackableLevelKey(
  w: TimeWindowLike,
  level: 1 | 2 | 3,
  lookups: GroupingLookups,
): { key: string; label: string; colour?: string } {
  const all = lookups.trackables ?? {};
  const single = resolvedTrackableId(w, lookups);
  const stamp = (w.attributedTrackableIds ?? (single ? [single] : [])).filter(
    (id) => all[id],
  );
  if (stamp.length === 0) return NO_TRACKABLE;

  // The most specific trackables: those that are not an ancestor of
  // another one the window counts toward.
  const ancestors = new Set<string>();
  for (const id of stamp) {
    for (const a of all[id]!.ancestorIds ?? []) ancestors.add(a);
  }
  const leaves = stamp.filter((id) => !ancestors.has(id));

  const atLevel = new Set<string>();
  const stopsAbove = new Set<string>();
  for (const leaf of leaves) {
    const path = [...(all[leaf]!.ancestorIds ?? []), leaf];
    const node = path[level - 1];
    if (node && all[node]) atLevel.add(node);
    else stopsAbove.add(leaf);
  }

  const byName = (a: string, b: string) =>
    all[a]!.name.localeCompare(all[b]!.name);
  const here = [...atLevel].sort(byName);
  const above = [...stopsAbove].sort(byName);
  const labels = here.map((id) => all[id]!.name);
  if (above.length > 0) {
    labels.push(`${above.map((id) => all[id]!.name).join(" + ")} directly`);
  }
  const first = here[0] ?? above[0]!;
  return {
    key: `${here.join("+")}|${above.join("+")}`,
    label: labels.join(" + "),
    colour: all[first]!.colour,
  };
}

function getGroupKeys(
  w: TimeWindowLike,
  mode: GroupByMode,
  lookups: GroupingLookups
): { key: string; label: string; colour?: string }[] {
  switch (mode) {
    case "task":
      if (w.taskId && lookups.tasks?.[w.taskId]?.name) {
        const t = lookups.tasks[w.taskId]!;
        return [{ key: w.taskId, label: plainMentions(t.name) ?? "Task" }];
      }
      return [{ key: "no_task", label: "No Task" }];

    case "list":
      if (w.taskId && lookups.tasks?.[w.taskId]?.listId) {
        const listId = lookups.tasks[w.taskId]!.listId!;
        const list = lookups.lists?.[listId];
        return [
          {
            key: listId,
            label: list?.name ?? "Unknown",
            colour: list?.colour,
          },
        ];
      }
      return [{ key: "no_list", label: "No List" }];

    case "trackable":
      return [trackableLevelKey(w, 1, lookups)];
    case "trackable_2":
      return [trackableLevelKey(w, 2, lookups)];
    case "trackable_3":
      return [trackableLevelKey(w, 3, lookups)];

    case "date": {
      const day = w.startDayYYYYMMDD;
      return [{ key: day, label: formatYYYYMMDDForDisplay(day) }];
    }

    case "day_of_week": {
      const d = new Date(
        parseInt(w.startDayYYYYMMDD.slice(0, 4)),
        parseInt(w.startDayYYYYMMDD.slice(4, 6)) - 1,
        parseInt(w.startDayYYYYMMDD.slice(6, 8))
      );
      const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dow = d.getDay();
      return [{ key: String(dow), label: names[dow] }];
    }

    case "month": {
      const monthKey = w.startDayYYYYMMDD.slice(0, 6);
      const year = parseInt(monthKey.slice(0, 4));
      const month = parseInt(monthKey.slice(4, 6)) - 1;
      const label = new Date(year, month).toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      return [{ key: monthKey, label }];
    }

    case "year":
      return [
        {
          key: w.startDayYYYYMMDD.slice(0, 4),
          label: w.startDayYYYYMMDD.slice(0, 4),
        },
      ];

    case "time_window": {
      const id = w._id?.trim();
      const key =
        id && id.length > 0
          ? id
          : `tw|${w.startDayYYYYMMDD}|${w.startTimeHHMM ?? ""}|${w.durationSeconds}|${w.taskId ?? ""}|${w.trackableId ?? ""}|${w.activityType}`;
      return [
        {
          key,
          label: formatTimeWindowWedgeLabel(w, lookups.analyticsTab),
        },
      ];
    }

    default:
      return [{ key: "all", label: "All" }];
  }
}

function accumulateWindow(
  buckets: Map<
    string,
    {
      label: string;
      totalSeconds: number;
      count: number;
      colour?: string;
      windows: TimeWindowLike[];
    }
  >,
  w: TimeWindowLike,
  mode: GroupByMode,
  lookups: GroupingLookups
) {
  const keys = getGroupKeys(w, mode, lookups);
  for (const { key, label, colour } of keys) {
    const existing = buckets.get(key);
    if (existing) {
      existing.totalSeconds += w.durationSeconds;
      existing.count += 1;
      existing.windows.push(w);
      const incoming = colour?.trim();
      if (incoming && !existing.colour?.trim()) {
        existing.colour = incoming;
      }
    } else {
      buckets.set(key, {
        label,
        totalSeconds: w.durationSeconds,
        count: 1,
        colour,
        windows: [w],
      });
    }
  }
}

export function groupTimeWindowsWithBuckets(
  windows: TimeWindowLike[],
  mode: GroupByMode,
  lookups: GroupingLookups
): GroupedBucket[] {
  const buckets = new Map<
    string,
    {
      label: string;
      totalSeconds: number;
      count: number;
      colour?: string;
      windows: TimeWindowLike[];
    }
  >();

  for (const w of windows) {
    accumulateWindow(buckets, w, mode, lookups);
  }

  const rows = Array.from(buckets.entries()).map(([key, data]) => ({
    key,
    label: data.label,
    totalSeconds: data.totalSeconds,
    count: data.count,
    colour: data.colour,
    windows: data.windows,
  }));

  if (mode === "time_window") {
    rows.sort((a, b) => {
      const wa = a.windows[0];
      const wb = b.windows[0];
      if (!wa) return 1;
      if (!wb) return -1;
      const ba = timeWindowBoundsMs(wa);
      const bb = timeWindowBoundsMs(wb);
      if (!ba && !bb) return a.key.localeCompare(b.key);
      if (!ba) return 1;
      if (!bb) return -1;
      const d = ba.startMs - bb.startMs;
      if (d !== 0) return d;
      return a.key.localeCompare(b.key);
    });
  } else {
    rows.sort((a, b) => b.totalSeconds - a.totalSeconds);
  }

  return rows;
}

export function groupTimeWindows(
  windows: TimeWindowLike[],
  mode: GroupByMode,
  lookups: GroupingLookups
): GroupedResult[] {
  return groupTimeWindowsWithBuckets(windows, mode, lookups).map(
    ({ windows: _w, ...rest }) => rest
  );
}

export const GROUP_BY_LABEL: Record<GroupByMode, string> = {
  trackable: "Trackable",
  trackable_2: "Sub-trackable",
  trackable_3: "Sub-trackable (level 3)",
  list: "List",
  task: "Task",
  date: "Date",
  day_of_week: "Day of Week",
  month: "Month",
  year: "Year",
  time_window: "Time window",
};

/**
 * Default grouping chain per analytics frequency.
 */
export function defaultGroupingLevelsForTab(tab: string): GroupByMode[] {
  switch (tab) {
    // Two rings by default: what the time went to, then the tasks inside
    // it. The list ring mostly repeated the trackable ring, and a date
    // ring split every task into slivers; both can still be added.
    case "DAILY":
    case "WEEKLY":
    case "MONTHLY":
    case "YEARLY":
    default:
      return ["trackable", "task"];
  }
}

/**
 * The default chain when the user's trackables form a tree: the top
 * level, what it is made up of, then the tasks.
 */
export function defaultTreeGroupingLevels(): GroupByMode[] {
  return ["trackable", "trackable_2", "task"];
}

export function modesForTab(tab: string): GroupByMode[] {
  switch (tab) {
    case "DAILY":
      return ["trackable", "trackable_2", "trackable_3", "list", "task", "time_window"];
    case "WEEKLY":
      return [
        "trackable",
        "trackable_2",
        "trackable_3",
        "list",
        "task",
        "time_window",
        "date",
        "day_of_week",
      ];
    case "MONTHLY":
      return [
        "trackable",
        "trackable_2",
        "trackable_3",
        "list",
        "task",
        "time_window",
        "date",
        "day_of_week",
        "month",
      ];
    case "YEARLY":
      return [
        "trackable",
        "trackable_2",
        "trackable_3",
        "list",
        "task",
        "time_window",
        "month",
        "day_of_week",
        "year",
        "date",
      ];
    default:
      return ["trackable", "trackable_2", "trackable_3", "list", "task", "time_window"];
  }
}

/** Modes from the tab pool not yet used (order preserved). */
export function modesAvailableToAdd(
  tab: string,
  levels: GroupByMode[]
): GroupByMode[] {
  return modesForTab(tab).filter((m) => !levels.includes(m));
}
