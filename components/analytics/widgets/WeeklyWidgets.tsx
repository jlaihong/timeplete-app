import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { getDayOfWeekLetter } from "../../../lib/dates";
import { AnalyticsTrackableCard } from "./AnalyticsTrackableCard";
import { AvgComparisonRow } from "./AvgComparisonRow";
import { LineChart, type LineSeries } from "./LineChart";
import { DayOfWeekCompletion } from "../../trackables/widgets/atoms/DayOfWeekCompletion";
import {
  accumulate,
  computeRequiredProgressPoints,
  getEffectiveCumulativeTarget,
  getTrackerCumulativeTarget,
} from "../../../lib/requiredProgress";
import type { AnalyticsWidgetProps } from "./types";

/* ──────────────────────────────────────────────────────────────────── *
 * Trackable Progression — Weekly tab.
 *
 * One widget per (collapsed) trackable type. Aggregation rules are
 * porting straight from productivity-one (`analytics-page-weekly.ts`
 * + `analytics-weekly-*-widget`). The orthogonal switches that
 * affect every widget below:
 *
 *   - `isCumulative` → series becomes a *running sum*, baseline
 *     `totalBeforePeriod`, AND a dashed required-progress overlay
 *     is drawn on the same chart. P1 reference:
 *     `required-progress.utils.ts` + each weekly widget's
 *     `chartData()`.
 *   - `isRatingTracker` (TRACKER only) → footer wording switches
 *     from "Count: N" to "Avg: N.N", computed as
 *     `countTotal / entryCount`. The chart series itself does NOT
 *     change shape (P1 `analytics-weekly-tracker-widget.ts:81-85`).
 *
 * Units quirk to remember: TIME_TRACK on the **weekly** tab uses
 * **hours**, not minutes. P1 divides `durationSeconds` by 3600 in
 * `analytics-page-weekly.ts:182-228` for that type. We previously
 * used minutes here — that was a unit bug.
 * ──────────────────────────────────────────────────────────────────── */

const REQUIRED_LINE_COLOUR = "#9CA3AF";

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsWeeklyDaysAWeekWidget
 *
 * DAYS_A_WEEK has no chart on the weekly tab — just the read-only
 * pill row + `N / target` summary + weekly-avg arrow. There's no
 * required-progress overlay because there's nothing to overlay it on.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsWeeklyDaysAWeekWidget({
  goal,
}: AnalyticsWidgetProps) {
  const numCompleted = goal.days.filter((d) => d.daysCompleted > 0).length;
  const target = goal.targetNumberOfDaysAWeek ?? 0;
  const met = target > 0 && numCompleted >= target;
  const pillDays = useMemo(
    () =>
      goal.days.map((d) => ({
        dayYYYYMMDD: d.day,
        numCompleted: d.daysCompleted,
      })),
    [goal.days]
  );

  return (
    <AnalyticsTrackableCard goal={goal}>
      <DayOfWeekCompletion
        days={pillDays}
        colour={goal.colour}
        onDayPress={() => {
          /* read-only on analytics */
        }}
      />
      <Text style={[styles.summary, met && { color: Colors.success }]}>
        {numCompleted.toFixed(0)} / {target}
      </Text>
      <AvgComparisonRow
        label="Weekly avg:"
        current={numCompleted}
        average={goal.weeklyAverage}
      />
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsWeeklyMinutesAWeekWidget
 *
 * 7-day line of *minutes* per day. When `isCumulative` we accumulate
 * from `totalBeforePeriod.secondsAttributed/60` and overlay a dashed
 * required-line whose effective target is
 * `targetNumberOfMinutesAWeek × totalDaysInclusive / 7`
 * (P1 `getEffectiveCumulativeTarget`). When non-cumulative the chart
 * stays per-day discrete.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsWeeklyMinutesAWeekWidget({
  goal,
}: AnalyticsWidgetProps) {
  const minutesByDay = goal.days.map((d) => d.secondsAttributed / 60);
  const total = minutesByDay.reduce((s, n) => s + n, 0);
  const target = goal.targetNumberOfMinutesAWeek ?? 0;
  const met = target > 0 && total >= target;

  const series: LineSeries[] = buildCumulativeOrDiscreteSeries({
    goal,
    valuesByDay: minutesByDay,
    baseline: goal.totalBeforePeriod.secondsAttributed / 60,
  });

  return (
    <AnalyticsTrackableCard goal={goal}>
      <LineChart
        series={series}
        xLabels={goal.days.map((d) => getDayOfWeekLetter(d.day))}
      />
      <Text style={[styles.summary, met && { color: Colors.success }]}>
        {total.toFixed(0)} / {target}
      </Text>
      <AvgComparisonRow
        label="Weekly avg:"
        current={total}
        average={goal.weeklyTimeAverageSeconds / 60}
        formatValue={(n) => `${n.toFixed(0)} min`}
      />
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsWeeklyNumberWidget — used for COUNT (`NUMBER`) and
 * TIME_TRACK on the Weekly tab.
 *
 * - NUMBER: per-day `daysCompleted` (count units), summary `+ N`.
 * - TIME_TRACK: per-day **hours** (NOT minutes — see top-of-file
 *   note), summary `+ N.N hrs`.
 *
 * Cumulative branch and dashed required-line work the same way as
 * the minutes widget; effective target is `targetCount` for NUMBER
 * and `targetNumberOfHours` for TIME_TRACK.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsWeeklyNumberWidget({ goal }: AnalyticsWidgetProps) {
  const isTime = goal.trackableType === "TIME_TRACK";
  const valuesByDay = goal.days.map((d) =>
    isTime ? d.secondsAttributed / 3600 : d.daysCompleted
  );
  const total = valuesByDay.reduce((s, n) => s + n, 0);
  const baseline = isTime
    ? goal.totalBeforePeriod.secondsAttributed / 3600
    : goal.totalBeforePeriod.daysCompleted;

  const series: LineSeries[] = buildCumulativeOrDiscreteSeries({
    goal,
    valuesByDay,
    baseline,
  });

  const avg = isTime
    ? goal.weeklyTimeAverageSeconds / 3600
    : goal.weeklyAverage;

  return (
    <AnalyticsTrackableCard goal={goal}>
      <LineChart
        series={series}
        xLabels={goal.days.map((d) => getDayOfWeekLetter(d.day))}
      />
      <Text style={styles.summary}>
        + {isTime ? total.toFixed(1) : total.toFixed(0)}
        {isTime ? " hrs" : ""}
      </Text>
      <AvgComparisonRow
        label="Weekly avg:"
        current={total}
        average={avg}
        formatValue={(n) =>
          isTime ? `${n.toFixed(1)} hrs` : n.toFixed(0)
        }
      />
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsWeeklyTrackerWidget — TRACKER on Weekly tab.
 *
 * Two dimensions, each toggled independently by `trackCount` and
 * `trackTime`. When both → dual-axis (count left / hours right). When
 * one → single series in the trackable colour.
 *
 * Cumulative + required overlay only when `isCumulative`. The
 * required line is drawn on the count series when `trackCount`,
 * and on the hours series when `trackTime`. Each side uses its own
 * target field (`targetCount` / `targetNumberOfHours`) — see
 * `getTrackerCumulativeTarget`.
 *
 * Footer wording: when `isRatingTracker`, "Count: N" becomes
 * "Avg: N.N" computed as `countTotal / entryCount`. P1 logic at
 * `analytics-weekly-tracker-widget.ts:81-85`.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsWeeklyTrackerWidget({ goal }: AnalyticsWidgetProps) {
  const showCount = goal.trackCount;
  const showTime = goal.trackTime;
  const showBoth = showCount && showTime;
  const isRating = goal.isRatingTracker;
  const cumulative = goal.isCumulative;

  // Time MUST come from `secondsAttributed` only — same source as the
  // home `TrackerWidget`'s `goal.totalTimeSeconds` (see
  // `convex/trackables.ts:651-666` where the backend already folds in
  // tracker entry seconds for TRACKER). Pulling from `trackerSeconds`
  // would double-count.
  const countByDay = goal.days.map((d) => d.trackerCount);
  const hoursByDay = goal.days.map((d) =>
    Number((d.secondsAttributed / 3600).toFixed(2))
  );
  const totalCount = countByDay.reduce((s, n) => s + n, 0);
  const totalHours = hoursByDay.reduce((s, n) => s + n, 0);

  // Rating average uses *entries* (not days) — P1 divides
  // `countForWeek` by `countEntriesForWeek`. Backend exposes
  // entry count via the lifetime totals; for the *week* we can
  // approximate the entry count as the number of days that had any
  // count recorded (good enough — matches P1's per-bucket rating
  // wording when each entry produced one count point per day).
  const entriesThisWeek = countByDay.filter((n) => n > 0).length;
  const ratingAvg = entriesThisWeek > 0 ? totalCount / entriesThisWeek : 0;

  const countColour = showBoth ? "#3B82F6" : goal.colour;
  const timeColour = showBoth ? "#10B981" : goal.colour;

  // ── Series ──
  const series: LineSeries[] = [];

  if (showCount) {
    const baseline = cumulative ? goal.totalBeforePeriod.trackerCount : 0;
    const data = cumulative ? accumulate(countByDay, baseline) : countByDay;
    series.push({
      name: showBoth ? "Count" : undefined,
      colour: countColour,
      data: data.map((y, x) => ({ x, y })),
      axis: "left",
    });
    if (cumulative) {
      const target = getTrackerCumulativeTarget(goal, "count");
      const required = computeRequiredProgressPoints(
        goal.startDayYYYYMMDD,
        goal.endDayYYYYMMDD,
        target,
        goal.days.map((d) => d.day),
      );
      if (required.length > 0) {
        series.push({
          name: "Required",
          colour: countColour,
          lineStyle: "dashed",
          data: required,
          axis: "left",
        });
      }
    }
  }

  if (showTime) {
    const baseline = cumulative
      ? goal.totalBeforePeriod.secondsAttributed / 3600
      : 0;
    const data = cumulative ? accumulate(hoursByDay, baseline) : hoursByDay;
    series.push({
      name: showBoth ? "Time" : undefined,
      colour: timeColour,
      data: data.map((y, x) => ({ x, y })),
      axis: showBoth ? "right" : "left",
    });
    if (cumulative) {
      const target = getTrackerCumulativeTarget(goal, "hours");
      const required = computeRequiredProgressPoints(
        goal.startDayYYYYMMDD,
        goal.endDayYYYYMMDD,
        target,
        goal.days.map((d) => d.day),
      );
      if (required.length > 0) {
        series.push({
          name: "Required",
          colour: timeColour,
          lineStyle: "dashed",
          data: required,
          axis: showBoth ? "right" : "left",
        });
      }
    }
  }

  return (
    <AnalyticsTrackableCard goal={goal}>
      <LineChart
        series={series}
        leftAxisLabel={showBoth ? "Count" : undefined}
        rightAxisLabel={showBoth ? "Hours" : undefined}
        xLabels={goal.days.map((d) => getDayOfWeekLetter(d.day))}
      />
      {showCount && (
        <View>
          <Text style={styles.summary}>
            {isRating
              ? `Avg: ${ratingAvg.toFixed(1)}`
              : showBoth
                ? `Count: ${totalCount}`
                : `+ ${totalCount}`}
          </Text>
          <AvgComparisonRow
            label={isRating ? "Rating avg:" : "Count avg:"}
            current={isRating ? ratingAvg : totalCount}
            average={goal.weeklyAverage}
            formatValue={(n) => n.toFixed(1)}
          />
        </View>
      )}
      {showTime && (
        <View>
          <Text style={styles.summary}>
            {showBoth
              ? `Time: ${totalHours.toFixed(1)} hrs`
              : `+ ${totalHours.toFixed(1)} hrs`}
          </Text>
          <AvgComparisonRow
            label="Time avg:"
            current={totalHours}
            average={goal.weeklyTimeAverageSeconds / 3600}
            formatValue={(n) => `${n.toFixed(1)} hrs`}
          />
        </View>
      )}
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * Shared series builder for the non-tracker weekly widgets. Picks
 * between per-day-discrete and cumulative-with-required-overlay based
 * on `goal.isCumulative` (P1 reference:
 * `analytics-weekly-number-widget.ts:67-122`).
 * ──────────────────────────────────────────────────────────────────── */
function buildCumulativeOrDiscreteSeries({
  goal,
  valuesByDay,
  baseline,
}: {
  goal: AnalyticsWidgetProps["goal"];
  valuesByDay: number[];
  baseline: number;
}): LineSeries[] {
  if (!goal.isCumulative) {
    return [
      {
        colour: goal.colour,
        data: valuesByDay.map((y, x) => ({ x, y })),
      },
    ];
  }

  const cumulative = accumulate(valuesByDay, baseline);
  const series: LineSeries[] = [
    {
      colour: goal.colour,
      data: cumulative.map((y, x) => ({ x, y })),
    },
  ];

  const effectiveTarget = getEffectiveCumulativeTarget(goal);
  if (effectiveTarget > 0) {
    const required = computeRequiredProgressPoints(
      goal.startDayYYYYMMDD,
      goal.endDayYYYYMMDD,
      effectiveTarget,
      goal.days.map((d) => d.day),
    );
    if (required.length > 0) {
      series.push({
        name: "Required",
        colour: REQUIRED_LINE_COLOUR,
        lineStyle: "dashed",
        data: required,
      });
    }
  }

  return series;
}

const styles = StyleSheet.create({
  summary: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
    marginTop: 6,
  },
});
