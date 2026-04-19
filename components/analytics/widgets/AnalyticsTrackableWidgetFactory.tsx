import React from "react";
import {
  AnalyticsDailyDaysAWeekWidget,
  AnalyticsDailyNumberWidget,
  AnalyticsDailyTrackerWidget,
} from "./DailyWidgets";
import {
  AnalyticsWeeklyDaysAWeekWidget,
  AnalyticsWeeklyMinutesAWeekWidget,
  AnalyticsWeeklyNumberWidget,
  AnalyticsWeeklyTrackerWidget,
} from "./WeeklyWidgets";
import { AnalyticsLineChartWidget } from "./AnalyticsLineChartWidget";
import type { AnalyticsTab } from "../AnalyticsState";
import type { TrackableSeriesGoal } from "./types";

interface AnalyticsTrackableWidgetFactoryProps {
  goal: TrackableSeriesGoal;
  tab: AnalyticsTab;
  windowStart: string;
  windowEnd: string;
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsTrackableWidgetFactory — picks the right analytics widget
 * for `(tab, trackableType)`. Mirrors productivity-one's per-tab
 * `@switch (trackableType)` chain (see audit doc § 1).
 *
 * | Tab     | Trackable type                | Widget                                 |
 * | ------- | ----------------------------- | -------------------------------------- |
 * | Daily   | TRACKER                       | AnalyticsDailyTrackerWidget            |
 * | Daily   | DAYS_A_WEEK                   | AnalyticsDailyDaysAWeekWidget          |
 * | Daily   | else                          | AnalyticsDailyNumberWidget             |
 * | Weekly  | TRACKER                       | AnalyticsWeeklyTrackerWidget           |
 * | Weekly  | DAYS_A_WEEK                   | AnalyticsWeeklyDaysAWeekWidget         |
 * | Weekly  | MINUTES_A_WEEK                | AnalyticsWeeklyMinutesAWeekWidget      |
 * | Weekly  | else (NUMBER, TIME_TRACK)     | AnalyticsWeeklyNumberWidget            |
 * | Monthly | *                             | AnalyticsLineChartWidget mode=monthly  |
 * | Yearly  | *                             | AnalyticsLineChartWidget mode=yearly   |
 *
 * Note: This factory is **not** the same as the home page's
 * `TrackableWidgetFactory`. They share the same `getGoalDetails`-
 * compatible aggregation helpers on the backend (so totals match), but
 * the home page renders interactive log surfaces while this renders
 * read-only charts and stats. That separation is the whole point per
 * the user's constraint.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsTrackableWidgetFactory({
  goal,
  tab,
  windowStart,
  windowEnd,
}: AnalyticsTrackableWidgetFactoryProps) {
  const common = { goal, windowStart, windowEnd };

  switch (tab) {
    case "DAILY":
      switch (goal.trackableType) {
        case "TRACKER":
          return <AnalyticsDailyTrackerWidget {...common} />;
        case "DAYS_A_WEEK":
          return <AnalyticsDailyDaysAWeekWidget {...common} />;
        default:
          return <AnalyticsDailyNumberWidget {...common} />;
      }
    case "WEEKLY":
      switch (goal.trackableType) {
        case "TRACKER":
          return <AnalyticsWeeklyTrackerWidget {...common} />;
        case "DAYS_A_WEEK":
          return <AnalyticsWeeklyDaysAWeekWidget {...common} />;
        case "MINUTES_A_WEEK":
          return <AnalyticsWeeklyMinutesAWeekWidget {...common} />;
        default:
          return <AnalyticsWeeklyNumberWidget {...common} />;
      }
    case "MONTHLY":
      return <AnalyticsLineChartWidget {...common} mode="monthly" />;
    case "YEARLY":
      return <AnalyticsLineChartWidget {...common} mode="yearly" />;
    default:
      return null;
  }
}
