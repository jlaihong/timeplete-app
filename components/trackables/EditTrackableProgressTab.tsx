import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDD,
  parseYYYYMMDD,
  startOfMonth,
  todayYYYYMMDD,
} from "../../lib/dates";

type GoalProgressType = "NUMBER" | "TIME_TRACK" | "DAYS_A_WEEK" | "MINUTES_A_WEEK";

type ProgressTabTrackable = {
  _id: Id<"trackables">;
  trackableType: GoalProgressType;
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  targetCount?: number;
  targetNumberOfHours?: number;
  targetNumberOfDaysAWeek?: number;
  targetNumberOfMinutesAWeek?: number;
  targetNumberOfWeeks?: number;
};

function clipYYYYMMDD(day: string, start: string, end: string): string {
  if (day < start) return start;
  if (day > end) return end;
  return day;
}

function addMonthsYYYYMMDD(ymd: string, delta: number): string {
  const d = parseYYYYMMDD(ymd.slice(0, 8));
  d.setMonth(d.getMonth() + delta);
  return formatYYYYMMDD(d);
}

/** Monday-based weekday index [0–6]. */
function mondayIndex(jsDate: Date): number {
  const wd = jsDate.getDay(); // Sun=0
  return wd === 0 ? 6 : wd - 1;
}

function buildMonthCells(monthAnchorYYYYMMDD: string): Array<{
  yyyymmdd: string;
  inMonth: boolean;
}> {
  const firstStr = startOfMonth(monthAnchorYYYYMMDD.slice(0, 8));
  const monthStartDate = parseYYYYMMDD(firstStr);
  const targetMonth = monthStartDate.getMonth();
  const targetYear = monthStartDate.getFullYear();
  const pad = mondayIndex(monthStartDate);

  const cells: Array<{ yyyymmdd: string; inMonth: boolean }> = [];
  const cursor = new Date(monthStartDate);
  cursor.setDate(cursor.getDate() - pad);

  for (let i = 0; i < 42; i++) {
    const ymd = formatYYYYMMDD(cursor);
    const inMonth =
      cursor.getMonth() === targetMonth && cursor.getFullYear() === targetYear;
    cells.push({ yyyymmdd: ymd, inMonth });
    cursor.setDate(cursor.getDate() + 1);
  }

  const lastOccupiedIdx = [...cells.entries()]
    .filter(([, c]) => c.inMonth)
    .map(([idx]) => idx)
    .pop();
  if (lastOccupiedIdx === undefined) {
    return cells;
  }
  const trimTo = Math.ceil((lastOccupiedIdx + 1) / 7) * 7 - 1;
  return cells.slice(0, trimTo + 1);
}

export function EditTrackableProgressTab({ trackable }: { trackable: ProgressTabTrackable }) {
  const type = trackable.trackableType;
  const caption = progressCaption(trackable);
  const showCalendar =
    type === "NUMBER" || type === "DAYS_A_WEEK" || type === "MINUTES_A_WEEK";

  const defaultAnchor = clipYYYYMMDD(todayYYYYMMDD(), trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD);
  const [viewAnchor, setViewAnchor] = useState(defaultAnchor);

  useEffect(() => {
    setViewAnchor(
      clipYYYYMMDD(todayYYYYMMDD(), trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD)
    );
  }, [trackable._id, trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD]);

  const daysSearch = useQuery(
    api.trackableDays.search,
    showCalendar ? { trackableIds: [trackable._id] } : "skip"
  );

  const completionByDay = useMemo(() => {
    const m = new Map<string, number>();
    if (!daysSearch) return m;
    for (const row of daysSearch) {
      m.set(row.dayYYYYMMDD.replace(/\D/g, "").slice(0, 8), row.numCompleted);
    }
    return m;
  }, [daysSearch]);

  const prevMonth = useCallback(() => {
    setViewAnchor(addMonthsYYYYMMDD(viewAnchor, -1));
  }, [viewAnchor]);

  const nextMonth = useCallback(() => {
    setViewAnchor(addMonthsYYYYMMDD(viewAnchor, 1));
  }, [viewAnchor]);

  if (type === "TIME_TRACK") {
    /** Productivity-one: empty Progress pane for TIME_TRACK (`<mat-tab label="Progress" />`). */
    return <View style={{ minHeight: 120 }} />;
  }

  const cells = buildMonthCells(viewAnchor);
  const titleDate = parseYYYYMMDD(viewAnchor.slice(0, 8));
  const monthTitle = titleDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  return (
    <View style={styles.wrap}>
      {caption ? (
        <Text style={styles.captionMuted} accessibilityRole="text">
          {caption}
        </Text>
      ) : null}

      <View style={styles.monthNav}>
        <Pressable
          onPress={prevMonth}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-back" size={22} color={Colors.textSecondary} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthTitle}</Text>
        <Pressable
          onPress={nextMonth}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          style={styles.navBtn}
        >
          <Ionicons name="chevron-forward" size={22} color={Colors.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.weekdayRow}>
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((label) => (
          <Text key={label} style={styles.weekdayHead}>
            {label}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((cell) => {
          const logged = completionByDay.get(cell.yyyymmdd) ?? 0;
          const inGoalRange =
            cell.yyyymmdd >= trackable.startDayYYYYMMDD &&
            cell.yyyymmdd <= trackable.endDayYYYYMMDD;
          const done = logged > 0 && inGoalRange;
          const faded = cell.inMonth === false || !inGoalRange;
          const isToday = cell.yyyymmdd === todayYYYYMMDD();

          return (
            <View
              key={cell.yyyymmdd}
              style={[
                styles.dayCell,
                done ? styles.dayDone : null,
                faded ? styles.dayFaded : null,
                isToday ? styles.dayTodayBorder : null,
              ]}
            >
              <Text
                style={[
                  styles.dayNum,
                  faded ? styles.dayNumFaded : null,
                  done ? styles.dayNumDone : null,
                ]}
              >
                {parseInt(cell.yyyymmdd.slice(6, 8), 10)}
              </Text>
            </View>
          );
        })}
      </View>
      {daysSearch === undefined ? (
        <Text style={styles.loadingHint}>Loading progress…</Text>
      ) : null}
    </View>
  );
}

function progressCaption(t: ProgressTabTrackable): string | undefined {
  switch (t.trackableType) {
    case "NUMBER":
      return `Target: ${t.targetCount != null ? String(t.targetCount) : "—"}`;
    case "TIME_TRACK":
      return undefined;
    case "DAYS_A_WEEK": {
      const w = t.targetNumberOfWeeks != null ? String(t.targetNumberOfWeeks) : "—";
      const d =
        t.targetNumberOfDaysAWeek != null ? String(t.targetNumberOfDaysAWeek) : "—";
      return `${d} day(s)/week × ${w} weeks`;
    }
    case "MINUTES_A_WEEK": {
      const m =
        t.targetNumberOfMinutesAWeek != null
          ? String(t.targetNumberOfMinutesAWeek)
          : "—";
      const w = t.targetNumberOfWeeks != null ? String(t.targetNumberOfWeeks) : "—";
      return `${m} minutes/week × ${w} weeks`;
    }
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4, gap: 8 },
  captionMuted: {
    textAlign: "center",
    color: Colors.textSecondary,
    fontSize: 15,
    marginBottom: 4,
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navBtn: { padding: 6 },
  monthLabel: { fontWeight: "600", color: Colors.text, fontSize: 15 },
  weekdayRow: { flexDirection: "row", marginTop: 4 },
  weekdayHead: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
  dayCell: {
    width: "13.6%",
    minWidth: 36,
    maxWidth: 48,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
    marginBottom: 2,
  },
  dayFaded: { opacity: 0.38 },
  dayDone: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primary,
  },
  dayTodayBorder: {
    borderWidth: 2,
    borderColor: Colors.primary,
  },
  dayNum: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.text,
  },
  dayNumFaded: { color: Colors.textTertiary },
  dayNumDone: { color: Colors.onPrimaryContainer },
  loadingHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
});
