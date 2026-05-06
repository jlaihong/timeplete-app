import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../../convex/_generated/api";
import { useAnalyticsState } from "./AnalyticsState";
import { useAuth } from "../../hooks/useAuth";

/* ──────────────────────────────────────────────────────────────────── *
 * `useAnalyticsDataset` is the source of truth for the **time-based**
 * Analytics sections (Time Breakdown, Time Spend). Both sections share
 * the same `getTimeBreakdown` payload so they cannot disagree about
 * which time windows belong to the current window.
 *
 * The Trackable Progression section deliberately does NOT use this
 * hook — it consumes `getGoalDetails` directly (the same query the
 * home page uses), so the same trackable shows the same numbers on
 * both pages for the same time window.
 *
 * `resolveTrackableId(timeWindow)` exposes the union attribution rule
 * so any client-side per-trackable aggregation matches
 * `getGoalDetails` / `getProgressionStats` on the backend.
 * ──────────────────────────────────────────────────────────────────── */

export interface TimeWindowLite {
  _id: string;
  startDayYYYYMMDD: string;
  startTimeHHMM: string;
  durationSeconds: number;
  activityType: "TASK" | "EVENT" | "TRACKABLE";
  taskId?: string | null;
  trackableId?: string | null;
  tagIds?: string[];
  budgetType: "ACTUAL" | "BUDGETED";
}

export interface TrackableLite {
  _id: string;
  name: string;
  colour: string;
  trackableType:
    | "NUMBER"
    | "TIME_TRACK"
    | "DAYS_A_WEEK"
    | "MINUTES_A_WEEK"
    | "TRACKER";
  archived?: boolean;
}

export function useAnalyticsDataset() {
  const { windowStart, windowEnd } = useAnalyticsState();
  const { profileReady } = useAuth();

  const data = useQuery(
    api.analytics.getTimeBreakdown,
    profileReady
      ? {
          startDay: windowStart,
          endDay: windowEnd,
        }
      : "skip",
  );

  const isLoading = data === undefined;

  // Stale-data guard — productivity-one returns [] when the loaded
  // payload doesn't match the active tab's range, preventing brief
  // flashes of last tab's numbers while a new query resolves.
  const isStale =
    data !== undefined &&
    (data.windowStart !== windowStart || data.windowEnd !== windowEnd);

  const tasks = (data?.tasks ?? {}) as Record<
    string,
    { name?: string; trackableId?: string; listId?: string } | undefined
  >;
  const lists = (data?.lists ?? {}) as Record<
    string,
    { name: string; colour: string } | undefined
  >;
  const tags = (data?.tags ?? {}) as Record<
    string,
    { name: string; colour: string } | undefined
  >;
  const trackables = (data?.trackables ?? {}) as Record<
    string,
    TrackableLite | undefined
  >;
  const listIdToTrackableId = (data?.listIdToTrackableId ?? {}) as Record<
    string,
    string
  >;

  const timeWindows = isStale
    ? ([] as TimeWindowLite[])
    : ((data?.timeWindows ?? []) as TimeWindowLite[]);

  const resolveTrackableId = useMemo(() => {
    return (w: TimeWindowLite): string | null => {
      if (w.trackableId) return w.trackableId;
      if (!w.taskId) return null;
      const task = tasks[w.taskId];
      if (!task) return null;
      if (task.trackableId) return task.trackableId;
      if (task.listId) return listIdToTrackableId[task.listId] ?? null;
      return null;
    };
  }, [tasks, listIdToTrackableId]);

  const totalSeconds = useMemo(
    () => timeWindows.reduce((s, w) => s + w.durationSeconds, 0),
    [timeWindows]
  );

  return {
    isLoading,
    isStale,
    timeWindows,
    tasks,
    lists,
    tags,
    trackables,
    listIdToTrackableId,
    resolveTrackableId,
    totalSeconds,
    windowStart,
    windowEnd,
  };
}

export type AnalyticsDataset = ReturnType<typeof useAnalyticsDataset>;
