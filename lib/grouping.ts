type TimeWindowLike = {
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

export function groupTimeWindows(
  windows: TimeWindowLike[],
  mode: GroupByMode,
  lookups: {
    tasks?: Record<string, { name: string; listId?: string }>;
    tags?: Record<string, { name: string; colour: string }>;
    lists?: Record<string, { name: string; colour: string }>;
    trackables?: Record<string, { name: string; colour: string }>;
  }
): GroupedResult[] {
  const groups = new Map<
    string,
    { label: string; totalSeconds: number; count: number; colour?: string }
  >();

  for (const w of windows) {
    const keys = getGroupKeys(w, mode, lookups);
    for (const { key, label, colour } of keys) {
      const existing = groups.get(key) ?? {
        label,
        totalSeconds: 0,
        count: 0,
        colour,
      };
      existing.totalSeconds += w.durationSeconds;
      existing.count += 1;
      groups.set(key, existing);
    }
  }

  return Array.from(groups.entries())
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.totalSeconds - a.totalSeconds);
}

function getGroupKeys(
  w: TimeWindowLike,
  mode: GroupByMode,
  lookups: any
): { key: string; label: string; colour?: string }[] {
  switch (mode) {
    case "task":
      if (w.taskId && lookups.tasks?.[w.taskId]) {
        const t = lookups.tasks[w.taskId];
        return [{ key: w.taskId, label: t.name }];
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
        const listId = lookups.tasks[w.taskId].listId;
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
      if (w.trackableId && lookups.trackables?.[w.trackableId]) {
        const t = lookups.trackables[w.trackableId];
        return [{ key: w.trackableId, label: t.name, colour: t.colour }];
      }
      return [{ key: "no_trackable", label: "No Goal" }];

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
