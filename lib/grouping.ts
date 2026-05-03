export type TimeWindowLike = {
  startDayYYYYMMDD: string;
  durationSeconds: number;
  activityType: string;
  taskId?: string | null;
  trackableId?: string | null;
  tagIds?: string[];
};

export type GroupByMode =
  | "task"
  | "tag"
  | "list"
  | "trackable"
  | "trackable_type"
  | "date"
  | "day_of_week"
  | "month"
  | "year";

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

const TRACKABLE_TYPE_LABEL: Record<TrackableTypeLite, string> = {
  NUMBER: "Count",
  TIME_TRACK: "Time",
  DAYS_A_WEEK: "Days / Week",
  MINUTES_A_WEEK: "Minutes / Week",
  TRACKER: "Tracker",
};

/** Mirrors `Colors.trackable` — kept local to avoid importing UI constants. */
const TRACKABLE_TYPE_COLOUR: Record<TrackableTypeLite, string> = {
  NUMBER: "#6750A4",
  TIME_TRACK: "#00DAF5",
  DAYS_A_WEEK: "#02E600",
  MINUTES_A_WEEK: "#F59E0B",
  TRACKER: "#E91E63",
};

export interface GroupingLookups {
  tasks?: Record<
    string,
    {
      name?: string;
      listId?: string;
      trackableId?: string;
    }
  >;
  tags?: Record<string, { name: string; colour: string }>;
  lists?: Record<string, { name: string; colour: string }>;
  trackables?: Record<
    string,
    { name: string; colour: string; trackableType?: TrackableTypeLite }
  >;
  listIdToTrackableId?: Record<string, string>;
  /**
   * Union attribution for trackable / trackable_type — matches
   * `useAnalyticsDataset.resolveTrackableId`.
   */
  resolveTrackableId?: (w: TimeWindowLike) => string | null;
}

function resolvedTrackableId(
  w: TimeWindowLike,
  lookups: GroupingLookups
): string | null {
  if (lookups.resolveTrackableId) return lookups.resolveTrackableId(w);
  if (w.trackableId) return w.trackableId;
  if (!w.taskId) return null;
  const task = lookups.tasks?.[w.taskId];
  if (!task) return null;
  if (task.trackableId) return task.trackableId;
  if (task.listId && lookups.listIdToTrackableId) {
    return lookups.listIdToTrackableId[task.listId] ?? null;
  }
  return null;
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
        return [{ key: w.taskId, label: t.name ?? "Task" }];
      }
      return [{ key: "no_task", label: "No Task" }];

    case "tag":
      if (w.tagIds && w.tagIds.length > 0) {
        return w.tagIds.map((tagId: string) => {
          const tag = lookups.tags?.[tagId];
          return {
            key: tagId,
            label: tag?.name ?? "Unknown",
            colour: tag?.colour,
          };
        });
      }
      return [{ key: "untagged", label: "Untagged" }];

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

    case "trackable": {
      const tid = resolvedTrackableId(w, lookups);
      if (tid && lookups.trackables?.[tid]) {
        const t = lookups.trackables[tid]!;
        return [{ key: tid, label: t.name, colour: t.colour }];
      }
      return [{ key: "no_trackable", label: "No Goal" }];
    }

    case "trackable_type": {
      const tid = resolvedTrackableId(w, lookups);
      if (tid && lookups.trackables?.[tid]?.trackableType) {
        const tt = lookups.trackables[tid]!.trackableType!;
        return [
          {
            key: tt,
            label: TRACKABLE_TYPE_LABEL[tt] ?? tt,
            colour: TRACKABLE_TYPE_COLOUR[tt],
          },
        ];
      }
      return [{ key: "unknown_type", label: "Unknown Type" }];
    }

    case "date":
      return [{ key: w.startDayYYYYMMDD, label: w.startDayYYYYMMDD }];

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

  return Array.from(buckets.entries())
    .map(([key, data]) => ({
      key,
      label: data.label,
      totalSeconds: data.totalSeconds,
      count: data.count,
      colour: data.colour,
      windows: data.windows,
    }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
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

export const MAX_GROUP_BY_LEVELS = 5;

/** Productivity-One style labels (Category / Project / Goal naming). */
export const GROUP_BY_DISPLAY_LABEL: Record<GroupByMode, string> = {
  trackable: "Goal",
  trackable_type: "Category",
  list: "Project",
  task: "Task",
  tag: "Tag",
  date: "Date",
  day_of_week: "Day of Week",
  month: "Month",
  year: "Year",
};

export function defaultGroupingLevelsForTab(tab: string): GroupByMode[] {
  return [defaultModeForTab(tab)];
}

/** Modes allowed for row `rowIndex` — duplicates forbidden across rows. */
export function pickerChoicesForRow(
  tab: string,
  levels: GroupByMode[],
  rowIndex: number
): GroupByMode[] {
  const pool = modesForTab(tab);
  const current = levels[rowIndex];
  return pool.filter(
    (m) =>
      m === current ||
      !levels.some((picked, j) => j !== rowIndex && picked === m)
  );
}

/** Next unused mode from the tab pool (stable pool order), or null if full. */
export function nextAvailableMode(
  tab: string,
  levels: GroupByMode[]
): GroupByMode | null {
  const pool = modesForTab(tab);
  const used = new Set(levels);
  return pool.find((m) => !used.has(m)) ?? null;
}

export function modesForTab(tab: string): GroupByMode[] {
  switch (tab) {
    case "DAILY":
      return [
        "trackable",
        "trackable_type",
        "list",
        "task",
        "tag",
      ];
    case "WEEKLY":
      return [
        "trackable",
        "trackable_type",
        "list",
        "task",
        "date",
        "tag",
      ];
    case "MONTHLY":
      return [
        "trackable",
        "trackable_type",
        "list",
        "task",
        "date",
        "tag",
        "day_of_week",
      ];
    case "YEARLY":
      return [
        "trackable",
        "trackable_type",
        "list",
        "task",
        "month",
        "tag",
        "day_of_week",
      ];
    default:
      return ["trackable", "trackable_type", "list", "task", "tag"];
  }
}

export function defaultModeForTab(tab: string): GroupByMode {
  switch (tab) {
    case "YEARLY":
      return "month";
    default:
      return "trackable";
  }
}
