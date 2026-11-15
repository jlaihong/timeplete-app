import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import { todayYYYYMMDD } from "../../lib/dates";
import {
  PERIODS,
  describeGoal,
  formatMeasure,
  goalStatus,
  periodRange,
  shiftDay,
  weekOf,
} from "../../lib/trackableShape";
import { TrackableLogDialog } from "./widgets/dialogs/TrackableLogDialog";

interface Props {
  trackableId: Id<"trackables">;
  colour: string;
}

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

/**
 * "Progress" on a trackable's page: where it stands against its goal, and
 * a month of days, each showing that day's value in the trackable's own
 * measure. Pressing a day opens the log dialog for it.
 *
 * Works for any measure and goal: the numbers come from
 * `convex/trackableProgress.ts`.
 */
export function TrackableProgressCalendar({ trackableId, colour }: Props) {
  const { profileReady } = useAuth();
  const today = todayYYYYMMDD();
  /** Any day in the month being shown. */
  const [anchor, setAnchor] = useState(today);
  const [logDay, setLogDay] = useState<string | null>(null);

  const progress = useQuery(
    api.trackableProgress.get,
    profileReady ? { id: trackableId, today } : "skip",
  );
  const month = useQuery(
    api.trackableProgress.month,
    profileReady ? { id: trackableId, day: anchor } : "skip",
  );

  const range = periodRange("month", anchor, "");
  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (
      let day = weekOf(range.start).start;
      day <= range.end;
      day = shiftDay(day, 7)
    ) {
      out.push(Array.from({ length: 7 }, (_, i) => shiftDay(day, i)));
    }
    return out;
  }, [range.start, range.end]);
  const valueByDay = useMemo(
    () => new Map((month?.days ?? []).map((d) => [d.dayYYYYMMDD, d.value])),
    [month],
  );

  const measure = progress?.measure ?? month?.measure ?? "time";
  const fmt = (n: number) => formatMeasure(measure, n);
  const goal = progress?.goal ?? null;
  const dailyGoal = goal?.period === "day" ? goal : null;

  return (
    <View style={styles.wrap}>
      {progress ? (
        <View style={styles.summary}>
          <Text style={styles.summaryValue}>
            {fmt(progress.value)}
            {progress.target !== null ? (
              <Text style={styles.summaryTarget}> / {fmt(progress.target)}</Text>
            ) : null}
          </Text>
          <Text style={styles.summaryLabel}>
            {PERIODS.find((p) => p.key === progress.period.kind)!.noun.toLowerCase()}
            {goal ? ` · ${describeGoal(measure, goal).toLowerCase()}` : " · no goal"}
          </Text>
          {progress.status === "met" ? (
            <Text style={styles.met}>Goal met</Text>
          ) : progress.status === "over" && progress.target !== null ? (
            <Text style={styles.over}>
              Over by {fmt(progress.value - progress.target)}
            </Text>
          ) : null}
        </View>
      ) : null}

      <View style={styles.nav}>
        <Pressable
          onPress={() => setAnchor(shiftDay(range.start, -1))}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
        >
          <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.monthTitle}>
          {MONTHS[Number(range.start.slice(4, 6)) - 1]} {range.start.slice(0, 4)}
          {month && month.total > 0 ? (
            <Text style={styles.monthTotal}> · {fmt(month.total)}</Text>
          ) : null}
        </Text>
        <Pressable
          onPress={() => setAnchor(shiftDay(range.end, 1))}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
        >
          <Ionicons
            name="chevron-forward"
            size={18}
            color={Colors.textSecondary}
          />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {WEEKDAYS.map((d) => (
          <Text key={d} style={styles.weekday}>
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]} style={styles.weekRow}>
          {week.map((day) => {
            const inMonth = day >= range.start && day <= range.end;
            const value = valueByDay.get(day) ?? 0;
            const status =
              dailyGoal && inMonth && (value > 0 || day <= today)
                ? goalStatus(measure, dailyGoal, value)
                : null;
            return (
              <Pressable
                key={day}
                disabled={!inMonth}
                onPress={() => setLogDay(day)}
                accessibilityRole="button"
                accessibilityLabel={`${Number(day.slice(6))}: ${value > 0 ? fmt(value) : "nothing"}. Log`}
                style={[
                  styles.cell,
                  !inMonth && styles.cellOutside,
                  value > 0 && { backgroundColor: `${colour}33` },
                  status === "met" && styles.cellMet,
                  status === "over" && styles.cellOver,
                  day === today && styles.cellToday,
                ]}
              >
                <Text style={styles.cellDay}>{Number(day.slice(6))}</Text>
                {inMonth && value > 0 ? (
                  <Text style={styles.cellValue} numberOfLines={1}>
                    {fmt(value)}
                  </Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      {logDay ? (
        <TrackableLogDialog
          trackableId={trackableId}
          dayYYYYMMDD={logDay}
          onClose={() => setLogDay(null)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  summary: { marginBottom: 10 },
  summaryValue: { fontSize: 24, fontWeight: "600", color: Colors.text },
  summaryTarget: { fontSize: FontSize.bodyLarge, color: Colors.textSecondary },
  summaryLabel: { fontSize: FontSize.caption, color: Colors.textSecondary },
  met: { marginTop: 2, fontSize: FontSize.caption, color: Colors.success },
  over: { marginTop: 2, fontSize: FontSize.caption, color: Colors.error },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  monthTitle: { fontSize: FontSize.body, fontWeight: "600", color: Colors.text },
  monthTotal: { fontWeight: "400", color: Colors.textSecondary },
  weekRow: { flexDirection: "row", gap: 4 },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
    paddingVertical: 2,
  },
  cell: {
    flex: 1,
    minHeight: 52,
    padding: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  cellOutside: { opacity: 0.25 },
  cellMet: { borderColor: Colors.success },
  cellOver: { borderColor: Colors.error },
  cellToday: { borderColor: Colors.primary, borderWidth: 2 },
  cellDay: { fontSize: FontSize.micro, color: Colors.textSecondary },
  cellValue: {
    marginTop: 4,
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.text,
  },
});
