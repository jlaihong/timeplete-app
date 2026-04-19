import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/**
 * Per-trackable analytics row returned by
 * `api.trackables.getTrackableAnalyticsSeries`. Every analytics widget
 * receives one of these.
 */
export type TrackableSeriesGoal = FunctionReturnType<
  typeof api.trackables.getTrackableAnalyticsSeries
>["trackables"][number];

export interface AnalyticsWidgetProps {
  goal: TrackableSeriesGoal;
  /** YYYYMMDD inclusive range — same window the parent section reads. */
  windowStart: string;
  windowEnd: string;
}
