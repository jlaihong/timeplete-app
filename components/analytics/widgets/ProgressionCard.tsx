import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import { useAuth } from "../../../hooks/useAuth";
import { todayYYYYMMDD } from "../../../lib/dates";
import {
  describeGoal,
  formatMeasure,
  goalTarget,
} from "../../../lib/trackableShape";
import {
  goalOutcome,
  progressionBars,
  type AnalyticsTab,
} from "../../../lib/trackableProgression";
import { SubTrackablePills } from "../../trackables/widgets/SubTrackablePills";

interface ProgressionCardProps {
  trackableId: Id<"trackables">;
  name: string;
  colour: string;
  tab: AnalyticsTab;
  /** The period on screen, YYYYMMDD. */
  windowStart: string;
  windowEnd: string;
}

const CHART_HEIGHT = 56;
const PERIOD_WORD = { day: "days", week: "weeks", month: "months" } as const;

/**
 * A trackable on the Analytics page, for the period on screen. The same
 * card for every trackable:
 *
 *   its value for the period in its own measure, and the change from the
 *   same number of days before;
 *   how its goal fared ("3 / 5h", or "4 of 7 days met" when the goal's
 *   period is shorter than the one on screen);
 *   a bar per day (week, month) or per month (year);
 *   what its sub-trackables contributed.
 */
export function ProgressionCard({
  trackableId,
  name,
  colour,
  tab,
  windowStart,
  windowEnd,
}: ProgressionCardProps) {
  const { profileReady } = useAuth();
  const today = todayYYYYMMDD();
  const data = useQuery(
    api.trackableProgress.range,
    profileReady ? { id: trackableId, start: windowStart, end: windowEnd, today } : "skip",
  );
  const open = (id: Id<"trackables">) =>
    router.push(`/(app)/edit-trackable/${id}`);

  const bars = useMemo(
    () =>
      data
        ? progressionBars(tab, data.start, data.end, data.days, data.cumulative)
        : [],
    [data, tab],
  );
  const outcome = useMemo(
    () =>
      data?.goal
        ? goalOutcome(
            data.measure,
            data.goal,
            data.start,
            data.end,
            data.days,
            today,
            data.cumulative,
          )
        : null,
    [data, today],
  );

  if (!data) return <View style={[styles.card, styles.loading]} />;
  const fmt = (n: number) => formatMeasure(data.measure, n);
  const delta = data.total - data.previousTotal;
  const max = Math.max(
    ...bars.map((b) => b.value),
    // Room for the goal line when the bars are days and the goal is daily.
    data.goal?.period === "day" && tab !== "YEARLY"
      ? goalTarget(data.measure, data.goal)
      : 0,
    1,
  );
  const goalLine =
    data.goal?.period === "day" && tab !== "YEARLY" && bars.length > 0
      ? goalTarget(data.measure, data.goal) / max
      : null;

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => open(trackableId)}
        accessibilityRole="link"
        accessibilityLabel={`Open ${name}`}
        style={styles.header}
      >
        <View style={[styles.dot, { backgroundColor: colour }]} />
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <Ionicons name="chevron-forward" size={14} color={Colors.textTertiary} />
      </Pressable>

      <View style={styles.numbers}>
        <Text style={styles.value}>{fmt(data.total)}</Text>
        {data.previousTotal > 0 || data.total > 0 ? (
          <Text style={styles.delta}>
            {delta === 0
              ? "same as the period before"
              : `${delta > 0 ? "+" : "−"}${fmt(Math.abs(delta))} vs the period before`}
          </Text>
        ) : null}
      </View>

      {data.goal ? (
        <Text style={styles.goal}>
          {describeGoal(data.measure, data.goal)}
          {outcome
            ? outcome.of === 1 && outcome.value !== null
              ? ` · ${fmt(outcome.value)} / ${fmt(outcome.target)}`
              : outcome.of > 0
                ? ` · ${outcome.met} of ${outcome.of} ${PERIOD_WORD[outcome.period]} met`
                : ""
            : ""}
        </Text>
      ) : null}

      {bars.length > 0 ? (
        <View style={styles.chart} accessibilityLabel={`${name} over the period`}>
          {goalLine !== null ? (
            <View
              style={[styles.goalLine, { bottom: goalLine * CHART_HEIGHT }]}
            />
          ) : null}
          {bars.map((bar) => (
            <View key={bar.key} style={styles.barSlot}>
              <View
                style={[
                  styles.bar,
                  {
                    height: Math.max(
                      bar.value > 0 ? 2 : 0,
                      (bar.value / max) * CHART_HEIGHT,
                    ),
                    backgroundColor: colour,
                  },
                ]}
              />
            </View>
          ))}
        </View>
      ) : null}
      {bars.length > 0 && bars.length <= 12 ? (
        <View style={styles.labels}>
          {bars.map((bar) => (
            <Text key={bar.key} style={styles.barLabel}>
              {bar.label}
            </Text>
          ))}
        </View>
      ) : null}

      <SubTrackablePills
        trackableId={trackableId}
        today={today}
        range={{ start: windowStart, end: windowEnd }}
        onPick={open}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 8,
    padding: 14,
    marginBottom: 10,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerLow,
  },
  loading: { height: 96 },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  numbers: { flexDirection: "row", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  value: { fontSize: 22, fontWeight: "600", color: Colors.text },
  delta: { fontSize: FontSize.caption, color: Colors.textSecondary },
  goal: { fontSize: FontSize.caption, color: Colors.textSecondary },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 2,
    height: CHART_HEIGHT,
    marginTop: 4,
  },
  barSlot: { flex: 1, height: CHART_HEIGHT, justifyContent: "flex-end" },
  bar: { borderRadius: 2 },
  goalLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.textTertiary,
  },
  labels: { flexDirection: "row", gap: 2 },
  barLabel: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
  },
});
