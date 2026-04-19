import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { AnalyticsTrackableCard } from "./AnalyticsTrackableCard";
import { AvgComparisonRow } from "./AvgComparisonRow";
import { LineChart, type LineSeries } from "./LineChart";
import {
  accumulate,
  buildYearlyAlignedRequiredProgressPoints,
  computeRequiredProgressPoints,
  getEffectiveCumulativeTarget,
  getTrackerCumulativeTarget,
} from "../../../lib/requiredProgress";
import type { AnalyticsWidgetProps } from "./types";

interface ChartWidgetProps extends AnalyticsWidgetProps {
  /** "monthly" → daily buckets in the month; "yearly" → monthly buckets. */
  mode: "monthly" | "yearly";
}

/* ──────────────────────────────────────────────────────────────────── *
 * Trackable Progression — Monthly + Yearly tab.
 *
 * P1 reuses one component for both views (`<app-analytics-line-chart-
 * widget>` driven by `lineChartData()` in `analytics-page-monthly.ts`
 * / `analytics-page-yearly.ts`). We do the same.
 *
 * Bucket shape:
 *   - Monthly: one bucket per day in the visible window.
 *   - Yearly:  one bucket per month, aggregated.
 *
 * Series choice (mirrors P1's per-type branches):
 *   - TRACKER + count + time   → dual-axis (count left, hours right)
 *   - TRACKER + count          → single count series
 *   - TRACKER + time           → single hours series
 *   - TIME_TRACK / MINUTES_A_W → hours series
 *   - DAYS_A_WEEK / NUMBER     → daysCompleted series
 *
 * Cumulative branch (`isCumulative`):
 *   - Each actual series becomes a running sum starting at the
 *     correct baseline from `totalBeforePeriod`. P1 uses this so the
 *     curve in the visible window picks up from "where we already
 *     were" before the window opened.
 *   - A dashed *required-progress* series is overlaid:
 *       Monthly → per-day required points.
 *       Yearly  → per-month required points evaluated at month-start.
 *     Effective target comes from `getEffectiveCumulativeTarget`
 *     (NUMBER / TIME_TRACK / MINUTES_A_WEEK / DAYS_A_WEEK) or
 *     `getTrackerCumulativeTarget` (TRACKER per-dimension).
 *
 * Footer wording:
 *   - Default: `+ N` total + `Monthly avg:` / `Yearly avg:` arrow row.
 *   - TRACKER + `isRatingTracker` → "Avg: N.N" instead of "Count: N",
 *     where the average is the per-entry average (count / entries).
 *     Mirrors P1 `analytics-page-monthly.ts:311-330` and
 *     `analytics-page-yearly.ts:438-447`.
 * ──────────────────────────────────────────────────────────────────── */

const REQUIRED_LINE_COLOUR = "#9CA3AF";

export function AnalyticsLineChartWidget({ goal, mode }: ChartWidgetProps) {
  const buckets = useMemo(
    () =>
      mode === "monthly"
        ? buildDailyBuckets(goal)
        : buildMonthlyBuckets(goal),
    [goal, mode]
  );

  const isTracker = goal.trackableType === "TRACKER";
  const showCount = isTracker ? goal.trackCount : true;
  const showTime =
    isTracker
      ? goal.trackTime
      : goal.trackableType === "TIME_TRACK" ||
        goal.trackableType === "MINUTES_A_WEEK";
  const showBoth = isTracker && showCount && showTime;
  const cumulative = goal.isCumulative;
  const isRating = isTracker && goal.isRatingTracker;

  const countColour = showBoth ? "#3B82F6" : goal.colour;
  const timeColour = showBoth ? "#10B981" : goal.colour;

  // Required-progress overlay needs the right reference dates. For
  // monthly the per-day bucket date is the YYYYMMDD itself; for
  // yearly we need each bucket's *first day of month* (P1's
  // `buildYearlyAlignedRequiredProgressPoints` aligns to month
  // starts).
  const referenceDates = useMemo(
    () =>
      mode === "monthly"
        ? buckets.map((b) => b.refDate)
        : buckets.map((b) => b.refDate),
    [buckets, mode]
  );

  // ── Series ──
  const series: LineSeries[] = [];

  if (isTracker) {
    if (showCount) {
      const baselineCount = cumulative ? goal.totalBeforePeriod.trackerCount : 0;
      const rawCount = buckets.map((b) => b.trackerCount);
      const data = cumulative ? accumulate(rawCount, baselineCount) : rawCount;
      series.push({
        name: showBoth ? "Count" : undefined,
        colour: countColour,
        data: data.map((y, x) => ({ x, y })),
        axis: "left",
      });
      if (cumulative) {
        const target = getTrackerCumulativeTarget(goal, "count");
        const required = buildRequired({
          mode,
          goal,
          referenceDates,
          target,
        });
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
      // Hours from `secondsAttributed` only — backend already folds
      // tracker entry seconds into this for TRACKER (see backend
      // comment near `secondsAttributed` build). Don't add
      // `trackerSeconds` again here or we double-count.
      const baselineHours = cumulative
        ? goal.totalBeforePeriod.secondsAttributed / 3600
        : 0;
      const rawHours = buckets.map((b) =>
        Number((b.secondsAttributed / 3600).toFixed(2))
      );
      const data = cumulative
        ? accumulate(rawHours, baselineHours)
        : rawHours;
      series.push({
        name: showBoth ? "Time" : undefined,
        colour: timeColour,
        data: data.map((y, x) => ({ x, y })),
        axis: showBoth ? "right" : "left",
      });
      if (cumulative) {
        const target = getTrackerCumulativeTarget(goal, "hours");
        const required = buildRequired({
          mode,
          goal,
          referenceDates,
          target,
        });
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
  } else if (
    goal.trackableType === "TIME_TRACK" ||
    goal.trackableType === "MINUTES_A_WEEK"
  ) {
    const baselineHours = cumulative
      ? goal.totalBeforePeriod.secondsAttributed / 3600
      : 0;
    const rawHours = buckets.map((b) =>
      Number((b.secondsAttributed / 3600).toFixed(2))
    );
    const data = cumulative
      ? accumulate(rawHours, baselineHours)
      : rawHours;
    series.push({
      colour: goal.colour,
      data: data.map((y, x) => ({ x, y })),
    });
    if (cumulative) {
      const effectiveTarget = getEffectiveCumulativeTarget(goal);
      // For MINUTES_A_WEEK the effective target is in *minutes* but
      // the actuals series above is in *hours* — convert.
      const targetInChartUnits =
        goal.trackableType === "MINUTES_A_WEEK"
          ? effectiveTarget / 60
          : effectiveTarget;
      const required = buildRequired({
        mode,
        goal,
        referenceDates,
        target: targetInChartUnits,
      });
      if (required.length > 0) {
        series.push({
          name: "Required",
          colour: REQUIRED_LINE_COLOUR,
          lineStyle: "dashed",
          data: required,
        });
      }
    }
  } else {
    // DAYS_A_WEEK / NUMBER — count units (days completed).
    const baselineCount = cumulative
      ? goal.totalBeforePeriod.daysCompleted
      : 0;
    const rawCount = buckets.map((b) => b.daysCompleted);
    const data = cumulative ? accumulate(rawCount, baselineCount) : rawCount;
    series.push({
      colour: goal.colour,
      data: data.map((y, x) => ({ x, y })),
    });
    if (cumulative) {
      const effectiveTarget = getEffectiveCumulativeTarget(goal);
      const required = buildRequired({
        mode,
        goal,
        referenceDates,
        target: effectiveTarget,
      });
      if (required.length > 0) {
        series.push({
          name: "Required",
          colour: REQUIRED_LINE_COLOUR,
          lineStyle: "dashed",
          data: required,
        });
      }
    }
  }

  // ── Footer totals (always over the visible window, not cumulative) ──
  const totalCount = buckets.reduce((s, b) => s + b.trackerCount, 0);
  const totalHours = buckets.reduce(
    (s, b) => s + b.secondsAttributed / 3600,
    0
  );
  const totalDays = buckets.reduce((s, b) => s + b.daysCompleted, 0);
  const totalEntriesInWindow = buckets.reduce(
    (s, b) => s + (b.trackerCount > 0 ? 1 : 0),
    0
  );
  const ratingAvg =
    totalEntriesInWindow > 0 ? totalCount / totalEntriesInWindow : 0;

  const avgLabel = mode === "monthly" ? "Monthly avg:" : "Yearly avg:";
  const avgCount = mode === "monthly" ? goal.monthlyAverage : goal.yearlyAverage;
  const avgHours =
    mode === "monthly"
      ? (goal.weeklyTimeAverageSeconds * (30 / 7)) / 3600
      : (goal.weeklyTimeAverageSeconds * (365 / 7)) / 3600;

  return (
    <AnalyticsTrackableCard goal={goal}>
      <LineChart
        series={series}
        height={140}
        xLabels={
          mode === "monthly"
            ? sparseDayLabels(buckets)
            : monthLabels(buckets)
        }
        leftAxisLabel={showBoth ? "Count" : isTracker && showTime ? "Hours" : ""}
        rightAxisLabel={showBoth ? "Hours" : ""}
      />

      {/* Footer rows */}
      {isTracker ? (
        <View style={styles.footerBlock}>
          {showCount && (
            <View>
              <Text style={styles.footerLine}>
                {isRating
                  ? `Avg: ${ratingAvg.toFixed(1)}`
                  : showBoth
                    ? `Count: ${totalCount}`
                    : `+ ${totalCount}`}
              </Text>
              <AvgComparisonRow
                label={isRating ? "Rating avg:" : avgLabel}
                current={isRating ? ratingAvg : totalCount}
                average={avgCount}
                formatValue={(n) => n.toFixed(1)}
              />
            </View>
          )}
          {showTime && (
            <View>
              <Text style={styles.footerLine}>
                {showBoth
                  ? `Time: ${totalHours.toFixed(1)} hrs`
                  : `+ ${totalHours.toFixed(1)} hrs`}
              </Text>
              <AvgComparisonRow
                label={avgLabel}
                current={totalHours}
                average={avgHours}
                formatValue={(n) => `${n.toFixed(1)} hrs`}
              />
            </View>
          )}
        </View>
      ) : showTime ? (
        <View style={styles.footerBlock}>
          <Text style={styles.footerLine}>+ {totalHours.toFixed(1)} hrs</Text>
          <AvgComparisonRow
            label={avgLabel}
            current={totalHours}
            average={avgHours}
            formatValue={(n) => `${n.toFixed(1)} hrs`}
          />
        </View>
      ) : (
        <View style={styles.footerBlock}>
          <Text style={styles.footerLine}>+ {totalDays.toFixed(0)}</Text>
          <AvgComparisonRow
            label={avgLabel}
            current={totalDays}
            average={avgCount}
            formatValue={(n) => n.toFixed(1)}
          />
        </View>
      )}
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * Required-progress builder. Routes to per-day vs month-aligned based
 * on the chart mode.
 * ──────────────────────────────────────────────────────────────────── */
function buildRequired({
  mode,
  goal,
  referenceDates,
  target,
}: {
  mode: "monthly" | "yearly";
  goal: AnalyticsWidgetProps["goal"];
  referenceDates: string[];
  target: number;
}) {
  if (target <= 0) return [];
  if (mode === "monthly") {
    return computeRequiredProgressPoints(
      goal.startDayYYYYMMDD,
      goal.endDayYYYYMMDD,
      target,
      referenceDates,
    );
  }
  return buildYearlyAlignedRequiredProgressPoints(
    goal.startDayYYYYMMDD,
    goal.endDayYYYYMMDD,
    target,
    referenceDates,
  );
}

interface Bucket {
  trackerCount: number;
  trackerSeconds: number;
  secondsAttributed: number;
  daysCompleted: number;
  /** label shown on x-axis */
  label: string;
  /** YYYYMMDD used as reference for required-progress evaluation */
  refDate: string;
}

function buildDailyBuckets(goal: AnalyticsWidgetProps["goal"]): Bucket[] {
  return goal.days.map((d) => ({
    trackerCount: d.trackerCount,
    trackerSeconds: d.trackerSeconds,
    secondsAttributed: d.secondsAttributed,
    daysCompleted: d.daysCompleted,
    label: d.day.slice(6, 8),
    refDate: d.day,
  }));
}

function buildMonthlyBuckets(goal: AnalyticsWidgetProps["goal"]): Bucket[] {
  const byMonth = new Map<string, Bucket>();
  for (const d of goal.days) {
    const monthKey = d.day.slice(0, 6);
    const cur =
      byMonth.get(monthKey) ??
      {
        trackerCount: 0,
        trackerSeconds: 0,
        secondsAttributed: 0,
        daysCompleted: 0,
        label: monthShort(parseInt(d.day.slice(4, 6), 10)),
        refDate: `${monthKey}01`,
      };
    cur.trackerCount += d.trackerCount;
    cur.trackerSeconds += d.trackerSeconds;
    cur.secondsAttributed += d.secondsAttributed;
    cur.daysCompleted += d.daysCompleted;
    byMonth.set(monthKey, cur);
  }
  return [...byMonth.values()];
}

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthShort(month1to12: number): string {
  return MONTH_SHORT[month1to12 - 1] ?? "";
}

function sparseDayLabels(buckets: Bucket[]): string[] {
  if (buckets.length === 0) return [];
  const step = Math.max(1, Math.floor(buckets.length / 5));
  return buckets.map((b, i) =>
    i === 0 || i === buckets.length - 1 || i % step === 0 ? b.label : ""
  );
}

function monthLabels(buckets: Bucket[]): string[] {
  return buckets.map((b) => b.label);
}

const styles = StyleSheet.create({
  footerBlock: { gap: 6, marginTop: 6 },
  footerLine: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
});
