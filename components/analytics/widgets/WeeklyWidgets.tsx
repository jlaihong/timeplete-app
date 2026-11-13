import { FontSize, Radius } from "../../../theme/tokens";
import React from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Colors } from "../../../constants/colors";
import { addDays, startOfWeek } from "../../../lib/dates";
import {
  computeRequiredProgressPoints,
  getEffectiveCumulativeTarget,
  getTrackerCumulativeTarget,
} from "../../../lib/requiredProgress";
import type { AnalyticsWidgetProps, TrackableSeriesGoal } from "./types";

/* ──────────────────────────────────────────────────────────────────── *
 * Trackable Progression — Weekly tab.
 *
 * Each trackable is one compact card: its name and the week's figure on
 * the first line, then seven day bars with the comparison to its usual
 * week beside them. A week is seven numbers, so bars read at a glance;
 * the line charts these replaced made every card ~200px tall and the
 * column a long scroll. The full history chart is one click away, on the
 * trackable's own page (the card's open button).
 *
 * Kept from the line-chart version:
 *   - TIME_TRACK reads in hours, MINUTES_A_WEEK in minutes.
 *   - Cumulative goals with a target still compare against the straight
 *     line from start to target; it is stated as "On pace" / "Behind by N"
 *     instead of drawn as a dashed overlay.
 *   - Rating trackers summarise as an average, not a sum.
 * ──────────────────────────────────────────────────────────────────── */

const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const BAR_AREA_HEIGHT = 28;

type Pace = { onPace: boolean; text: string } | null;

function WeeklyCard({
  goal,
  windowStart,
  valuesByDay,
  binary = false,
  summary,
  summaryMet = false,
  average,
  current,
  formatAverage,
  pace,
  secondLine,
}: {
  goal: TrackableSeriesGoal;
  windowStart: string;
  /** Value per day present in `goal.days` (the week so far). */
  valuesByDay: number[];
  /** Done / not done days: every non-zero bar is full height. */
  binary?: boolean;
  summary: string;
  summaryMet?: boolean;
  average: number;
  current: number;
  formatAverage: (n: number) => string;
  pace?: Pace;
  secondLine?: string;
}) {
  const monday = startOfWeek(windowStart);
  const byDay = new Map(goal.days.map((d, i) => [d.day, valuesByDay[i] ?? 0]));
  const lastDay = goal.days.length
    ? goal.days[goal.days.length - 1].day
    : monday;
  const max = Math.max(0, ...valuesByDay);
  const showAverage = Number.isFinite(average) && average > 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.dot, { backgroundColor: goal.colour }]} />
        <Text style={styles.title} numberOfLines={1}>
          {goal.name}
        </Text>
        <Text
          style={[styles.summary, summaryMet && { color: Colors.success }]}
          numberOfLines={1}
        >
          {summary}
        </Text>
        <Pressable
          onPress={() => router.push(`/(app)/edit-trackable/${goal._id}`)}
          accessibilityRole="button"
          accessibilityLabel={`Open details for ${goal.name}`}
          hitSlop={6}
          style={styles.openBtn}
        >
          <Ionicons name="open-outline" size={14} color={Colors.textTertiary} />
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.bars}>
          {DAY_LETTERS.map((letter, i) => {
            const day = addDays(monday, i);
            const value = byDay.get(day) ?? 0;
            const future = day > lastDay;
            const height =
              value > 0 && max > 0
                ? binary
                  ? BAR_AREA_HEIGHT
                  : Math.max(3, Math.round((value / max) * BAR_AREA_HEIGHT))
                : 2;
            return (
              <View key={i} style={styles.barCol}>
                <View style={styles.barArea}>
                  <View
                    style={[
                      styles.bar,
                      { height },
                      value > 0
                        ? { backgroundColor: goal.colour }
                        : future
                          ? styles.barFuture
                          : styles.barEmpty,
                    ]}
                  />
                </View>
                <Text style={[styles.barLetter, future && styles.barLetterFuture]}>
                  {letter}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.side}>
          {secondLine ? <Text style={styles.sideText}>{secondLine}</Text> : null}
          {showAverage ? (
            <View style={styles.sideRow}>
              <Text style={styles.sideText}>
                Usually {formatAverage(average)}
              </Text>
              {current > average ? (
                <Ionicons name="caret-up" size={11} color={Colors.success} />
              ) : current < average ? (
                <Ionicons name="caret-down" size={11} color={Colors.error} />
              ) : null}
            </View>
          ) : null}
          {pace ? (
            <Text
              style={[
                styles.sideText,
                { color: pace.onPace ? Colors.success : Colors.warning },
              ]}
            >
              {pace.text}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * Where a cumulative goal stands against the straight line from its start
 * to its target, as of the last day shown.
 */
function paceFor(
  goal: TrackableSeriesGoal,
  target: number,
  actualTotal: number,
  format: (n: number) => string,
): Pace {
  if (!goal.isCumulative || target <= 0 || goal.days.length === 0) return null;
  const points = computeRequiredProgressPoints(
    goal.startDayYYYYMMDD,
    goal.endDayYYYYMMDD,
    target,
    goal.days.map((d) => d.day),
  );
  const required = points.length ? points[points.length - 1].y : 0;
  if (required <= 0) return null;
  const gap = required - actualTotal;
  return gap <= 0
    ? { onPace: true, text: "On pace" }
    : { onPace: false, text: `Behind by ${format(gap)}` };
}

const whole = (n: number) => Math.round(n).toString();
const oneDecimal = (n: number) => n.toFixed(1);

/* DAYS_A_WEEK: which days were done, against the weekly target. */
export function AnalyticsWeeklyDaysAWeekWidget({
  goal,
  windowStart,
}: AnalyticsWidgetProps) {
  const valuesByDay = goal.days.map((d) => (d.daysCompleted > 0 ? 1 : 0));
  const done = valuesByDay.reduce((s: number, n) => s + n, 0);
  const target = goal.targetNumberOfDaysAWeek ?? 0;
  return (
    <WeeklyCard
      goal={goal}
      windowStart={windowStart}
      valuesByDay={valuesByDay}
      binary
      summary={target > 0 ? `${done} / ${target}` : `${done}`}
      summaryMet={target > 0 && done >= target}
      current={done}
      average={goal.weeklyAverage}
      formatAverage={oneDecimal}
    />
  );
}

/* MINUTES_A_WEEK: minutes per day, against the weekly minutes target. */
export function AnalyticsWeeklyMinutesAWeekWidget({
  goal,
  windowStart,
}: AnalyticsWidgetProps) {
  const valuesByDay = goal.days.map((d) => d.secondsAttributed / 60);
  const total = valuesByDay.reduce((s, n) => s + n, 0);
  const target = goal.targetNumberOfMinutesAWeek ?? 0;
  return (
    <WeeklyCard
      goal={goal}
      windowStart={windowStart}
      valuesByDay={valuesByDay}
      summary={
        target > 0 ? `${whole(total)} / ${target} min` : `${whole(total)} min`
      }
      summaryMet={target > 0 && total >= target}
      current={total}
      average={goal.weeklyTimeAverageSeconds / 60}
      formatAverage={(n) => `${whole(n)} min`}
      pace={paceFor(
        goal,
        getEffectiveCumulativeTarget(goal),
        goal.totalBeforePeriod.secondsAttributed / 60 + total,
        (n) => `${whole(n)} min`,
      )}
    />
  );
}

/* NUMBER (a count) and TIME_TRACK (hours). */
export function AnalyticsWeeklyNumberWidget({
  goal,
  windowStart,
}: AnalyticsWidgetProps) {
  const isTime = goal.trackableType === "TIME_TRACK";
  const valuesByDay = goal.days.map((d) =>
    isTime ? d.secondsAttributed / 3600 : d.daysCompleted,
  );
  const total = valuesByDay.reduce((s, n) => s + n, 0);
  const baseline = isTime
    ? goal.totalBeforePeriod.secondsAttributed / 3600
    : goal.totalBeforePeriod.daysCompleted;
  const format = (n: number) => (isTime ? `${oneDecimal(n)} hrs` : whole(n));
  return (
    <WeeklyCard
      goal={goal}
      windowStart={windowStart}
      valuesByDay={valuesByDay}
      summary={`+${format(total)}`}
      current={total}
      average={isTime ? goal.weeklyTimeAverageSeconds / 3600 : goal.weeklyAverage}
      formatAverage={format}
      pace={paceFor(
        goal,
        getEffectiveCumulativeTarget(goal),
        baseline + total,
        format,
      )}
    />
  );
}

/*
 * TRACKER: a count, time, or both. Bars follow the count when there is
 * one (it is what a tracker is usually read by), else the hours. Time
 * comes from `secondsAttributed` only, the same source as the home card.
 */
export function AnalyticsWeeklyTrackerWidget({
  goal,
  windowStart,
}: AnalyticsWidgetProps) {
  const showCount = goal.trackCount;
  const showTime = goal.trackTime;
  const countByDay = goal.days.map((d) => d.trackerCount);
  const hoursByDay = goal.days.map((d) => d.secondsAttributed / 3600);
  const totalCount = countByDay.reduce((s, n) => s + n, 0);
  const totalHours = hoursByDay.reduce((s, n) => s + n, 0);

  // A rating is averaged over the days it was given, not summed.
  const ratedDays = countByDay.filter((n) => n > 0).length;
  const ratingAvg = ratedDays > 0 ? totalCount / ratedDays : 0;
  const isRating = goal.isRatingTracker;

  if (!showCount && !showTime) {
    return (
      <WeeklyCard
        goal={goal}
        windowStart={windowStart}
        valuesByDay={[]}
        summary="–"
        current={0}
        average={0}
        formatAverage={whole}
      />
    );
  }

  const hours = (n: number) => `${oneDecimal(n)} hrs`;

  if (showCount) {
    return (
      <WeeklyCard
        goal={goal}
        windowStart={windowStart}
        valuesByDay={countByDay}
        summary={isRating ? `Avg ${oneDecimal(ratingAvg)}` : `+${totalCount}`}
        current={isRating ? ratingAvg : totalCount}
        average={goal.weeklyAverage}
        formatAverage={oneDecimal}
        secondLine={showTime ? hours(totalHours) : undefined}
        pace={
          isRating
            ? null
            : paceFor(
                goal,
                getTrackerCumulativeTarget(goal, "count"),
                goal.totalBeforePeriod.trackerCount + totalCount,
                whole,
              )
        }
      />
    );
  }

  return (
    <WeeklyCard
      goal={goal}
      windowStart={windowStart}
      valuesByDay={hoursByDay}
      summary={`+${hours(totalHours)}`}
      current={totalHours}
      average={goal.weeklyTimeAverageSeconds / 3600}
      formatAverage={hours}
      pace={paceFor(
        goal,
        getTrackerCumulativeTarget(goal, "hours"),
        goal.totalBeforePeriod.secondsAttributed / 3600 + totalHours,
        hours,
      )}
    />
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerLow,
    gap: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    ...Platform.select({
      web: { userSelect: "none" } as object,
      default: {},
    }),
  },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  summary: {
    fontSize: FontSize.body,
    fontWeight: "700",
    color: Colors.text,
    fontVariant: ["tabular-nums"],
  },
  openBtn: { padding: 2 },
  body: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  bars: { flex: 1, flexDirection: "row", gap: 4, maxWidth: 220 },
  barCol: { flex: 1, alignItems: "stretch", gap: 3 },
  barArea: { height: BAR_AREA_HEIGHT, justifyContent: "flex-end" },
  bar: { borderRadius: 2 },
  barEmpty: { backgroundColor: Colors.surfaceContainerHighest },
  barFuture: { backgroundColor: Colors.surfaceContainerHigh },
  barLetter: {
    fontSize: FontSize.micro,
    textAlign: "center",
    color: Colors.textTertiary,
  },
  barLetterFuture: { opacity: 0.5 },
  side: { flex: 1, alignItems: "flex-end", gap: 2, paddingBottom: 14 },
  sideRow: { flexDirection: "row", alignItems: "center", gap: 3 },
  sideText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
  },
});
