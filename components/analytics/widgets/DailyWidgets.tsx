import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { AnalyticsTrackableCard } from "./AnalyticsTrackableCard";
import { AvgComparisonRow } from "./AvgComparisonRow";
import type { AnalyticsWidgetProps } from "./types";

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsDailyDaysAWeekWidget — productivity-one mirror.
 *
 * Layout: header + centered glyph (`✓` if any progress on the day,
 * `–` otherwise). Read-only.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsDailyDaysAWeekWidget({ goal }: AnalyticsWidgetProps) {
  const day = goal.days[0];
  const completed = (day?.daysCompleted ?? 0) > 0;
  return (
    <AnalyticsTrackableCard goal={goal}>
      <View style={styles.center}>
        <Text style={[styles.bigGlyph, completed && { color: Colors.success }]}>
          {completed ? "✓" : "–"}
        </Text>
      </View>
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsDailyNumberWidget — productivity-one mirror for COUNT,
 * TIME_TRACK, MINUTES_A_WEEK on the Daily tab.
 *
 * Layout: header + `+ N` (or `–` when N == 0) + `Daily avg:` arrow row.
 *
 * Per-type field sources match the home widgets exactly:
 *   - NUMBER (COUNT)     → `daysCompleted` (= trackableDays.numCompleted)
 *                          home: `goal.todayDayCount`
 *   - TIME_TRACK         → `secondsAttributed` (= timeWindows)
 *                          home: `goal.todaySeconds`, displayed as hrs
 *   - MINUTES_A_WEEK     → `secondsAttributed` displayed as minutes
 *                          (home doesn't have a per-day "today" minutes
 *                          display; weekly bar uses `goal.weeklySeconds`,
 *                          and we sum the same source per day)
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsDailyNumberWidget({ goal }: AnalyticsWidgetProps) {
  const day = goal.days[0];
  const isTime =
    goal.trackableType === "TIME_TRACK" ||
    goal.trackableType === "MINUTES_A_WEEK";
  // Prefer hours for TIME_TRACK (matches home), minutes for
  // MINUTES_A_WEEK (matches its own weekly display unit).
  const useHours = goal.trackableType === "TIME_TRACK";

  const seconds = day?.secondsAttributed ?? 0;
  const value = isTime
    ? useHours
      ? seconds / 3600
      : seconds / 60
    : day?.daysCompleted ?? 0;
  const avg = isTime
    ? useHours
      ? goal.dailyTimeAverageSeconds / 3600
      : goal.dailyTimeAverageSeconds / 60
    : goal.dailyCountAverage;
  const unit = isTime ? (useHours ? " hrs" : " min") : "";
  const decimals = isTime ? (useHours ? 1 : 0) : 1;

  return (
    <AnalyticsTrackableCard goal={goal}>
      <View style={styles.center}>
        <Text style={styles.bigNumber}>
          {value > 0 ? `+ ${formatNumber(value, decimals)}${unit}` : "–"}
        </Text>
        <AvgComparisonRow
          label="Daily avg:"
          current={value}
          average={avg}
          formatValue={(n) => `${formatNumber(n, decimals)}${unit}`}
        />
      </View>
    </AnalyticsTrackableCard>
  );
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsDailyTrackerWidget — productivity-one mirror.
 *
 * Two stacked stat rows (count + time) when both dimensions are tracked,
 * each with `total` (lifetime) → `+today` → `avg/day` and arrows.
 *
 * Data sources MUST match the home `TrackerWidget` exactly so the same
 * trackable shows the same numbers on both screens:
 *   - Count: `trackerEntries.countValue`     (= day.trackerCount)
 *   - Time:  `timeWindows.durationSeconds`   (= day.secondsAttributed)
 *
 * `trackerEntries.durationSeconds` is intentionally NOT counted here —
 * the home widget reads `goal.todaySeconds` / `goal.totalTimeSeconds`
 * which only sum attributed time windows. Mixing in the entry-time
 * field would make analytics > home for any trackable that logged
 * extra time via the "Add progress" dialog.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsDailyTrackerWidget({ goal }: AnalyticsWidgetProps) {
  const day = goal.days[0];
  const showCount = goal.trackCount;
  const showTime = goal.trackTime;
  const todayCount = day?.trackerCount ?? 0;
  const todayTimeHrs = (day?.secondsAttributed ?? 0) / 3600;
  const totalCount = goal.lifetime.totalEntryCount;
  const totalTimeHrs = goal.lifetime.totalSeconds / 3600;

  return (
    <AnalyticsTrackableCard goal={goal}>
      {showCount && (
        <View style={styles.statsRow}>
          <Text style={styles.statTotal}>
            {formatNumber(totalCount, 0)} total
          </Text>
          <Text style={[styles.statToday, todayCount > 0 && styles.statTodayPos]}>
            {todayCount > 0 ? `+${todayCount}` : "—"} today
          </Text>
          <Text style={styles.statAvg}>
            {formatNumber(goal.dailyCountAverage, 1)}/day avg
          </Text>
        </View>
      )}
      {showTime && (
        <View style={styles.statsRow}>
          <Text style={styles.statTotal}>
            {formatNumber(totalTimeHrs, 1)} hrs total
          </Text>
          <Text
            style={[styles.statToday, todayTimeHrs > 0 && styles.statTodayPos]}
          >
            {todayTimeHrs > 0 ? `+${formatNumber(todayTimeHrs, 1)} hrs` : "—"}{" "}
            today
          </Text>
          <Text style={styles.statAvg}>
            {formatNumber(goal.dailyTimeAverageSeconds / 3600, 1)} hrs/day avg
          </Text>
        </View>
      )}
      {!showCount && !showTime && (
        <Text style={styles.empty}>No dimensions tracked.</Text>
      )}
    </AnalyticsTrackableCard>
  );
}

function formatNumber(n: number, digits: number): string {
  if (!Number.isFinite(n)) return "0";
  return n.toFixed(digits);
}

const styles = StyleSheet.create({
  center: { alignItems: "center" },
  bigGlyph: {
    fontSize: 32,
    fontWeight: "700",
    color: Colors.textTertiary,
    lineHeight: 36,
  },
  bigNumber: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  statTotal: { fontSize: 12, color: Colors.textSecondary },
  statToday: { fontSize: 12, color: Colors.textTertiary },
  statTodayPos: { color: Colors.success },
  statAvg: { fontSize: 11, color: Colors.textTertiary },
  empty: { fontSize: 12, color: Colors.textTertiary, textAlign: "center" },
});
