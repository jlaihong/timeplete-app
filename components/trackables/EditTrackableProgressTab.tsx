import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDD,
  formatYYYYMMDDForDisplay,
  parseYYYYMMDD,
  startOfMonth,
  todayYYYYMMDD,
} from "../../lib/dates";
import { useAuth } from "../../hooks/useAuth";
import { DialogCard, DialogHeader, DialogOverlay } from "../ui/DialogScaffold";

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

type DayDetail = {
  numCompleted: number;
  comments: string;
  completedTaskNames: string[];
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

function normalizeDayKey(ymd: string): string {
  return ymd.replace(/\D/g, "").slice(0, 8);
}

/** In-cell preview lines; full lists open in the day-detail modal. */
const MAX_TASK_LINES = 4;

/** Grid gap ~1.5× prior 4px. Cell size is driven by row width + `aspectRatio: 1` (square). */
const GAP = Math.round(4 * 1.5);

export function EditTrackableProgressTab({ trackable }: { trackable: ProgressTabTrackable }) {
  const { profileReady } = useAuth();
  const type = trackable.trackableType;
  const caption = progressCaption(trackable);
  const showCalendar =
    type === "NUMBER" || type === "DAYS_A_WEEK" || type === "MINUTES_A_WEEK";

  const defaultAnchor = clipYYYYMMDD(todayYYYYMMDD(), trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD);
  const [viewAnchor, setViewAnchor] = useState(defaultAnchor);
  const [expandedDayYYYYMMDD, setExpandedDayYYYYMMDD] = useState<string | null>(
    null,
  );

  useEffect(() => {
    setViewAnchor(
      clipYYYYMMDD(todayYYYYMMDD(), trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD)
    );
  }, [trackable._id, trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD]);

  const cells = useMemo(() => buildMonthCells(viewAnchor), [viewAnchor]);

  const calendarBounds = useMemo(() => {
    if (cells.length === 0) return null;
    return {
      start: cells[0]!.yyyymmdd,
      end: cells[cells.length - 1]!.yyyymmdd,
    };
  }, [cells]);

  /**
   * Compose month data from queries already on the deployed Convex endpoint —
   * avoids a dedicated `progressCalendarDetails` round-trip (not present until
   * `npx convex dev` / deploy picks up new functions).
   */
  const daysSearch = useQuery(
    api.trackableDays.search,
    profileReady && showCalendar && calendarBounds
      ? {
          trackableIds: [trackable._id],
          startDay: calendarBounds.start,
          endDay: calendarBounds.end,
        }
      : "skip",
  );

  const completedWindowTasks = useQuery(
    api.tasks.searchWithCriteria,
    profileReady && showCalendar && calendarBounds
      ? {
          dayRanges: [
            { startDay: calendarBounds.start, endDay: calendarBounds.end },
          ],
          includeCompleted: true,
          completedStartDay: calendarBounds.start,
          completedEndDay: calendarBounds.end,
        }
      : "skip",
  );

  const listsSearch = useQuery(
    api.lists.search,
    profileReady && showCalendar ? {} : "skip",
  );

  const detailsByDay = useMemo(() => {
    const m = new Map<string, DayDetail>();

    if (daysSearch) {
      for (const row of daysSearch) {
        const key = normalizeDayKey(row.dayYYYYMMDD);
        m.set(key, {
          numCompleted: row.numCompleted,
          comments: (row.comments ?? "").trim(),
          completedTaskNames: [],
        });
      }
    }

    const listToTrackable = new Map<string, Id<"trackables">>();
    if (listsSearch) {
      for (const list of listsSearch) {
        if (list.trackableId) {
          listToTrackable.set(list._id, list.trackableId);
        }
      }
    }

    if (completedWindowTasks) {
      const tid = trackable._id;
      for (const task of completedWindowTasks) {
        if (!task.dateCompleted) continue;
        const dayKey = normalizeDayKey(task.dateCompleted);
        if (dayKey.length !== 8) continue;

        const attributesToTrackable =
          task.trackableId === tid ||
          (task.listId != null && listToTrackable.get(task.listId) === tid);
        if (!attributesToTrackable) continue;

        const existing = m.get(dayKey);
        if (!existing) {
          m.set(dayKey, {
            numCompleted: 0,
            comments: "",
            completedTaskNames: [task.name],
          });
        } else {
          existing.completedTaskNames.push(task.name);
        }
      }
    }

    return m;
  }, [daysSearch, completedWindowTasks, listsSearch, trackable._id]);

  const calendarLoading =
    daysSearch === undefined ||
    completedWindowTasks === undefined ||
    listsSearch === undefined;

  const cellRows = useMemo(() => {
    const rows: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      rows.push(cells.slice(i, i + 7));
    }
    return rows;
  }, [cells]);

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

  const titleDate = parseYYYYMMDD(viewAnchor.slice(0, 8));
  const monthTitle = titleDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const expandedDetail =
    expandedDayYYYYMMDD != null
      ? detailsByDay.get(normalizeDayKey(expandedDayYYYYMMDD))
      : undefined;
  const expandedDayLabel =
    expandedDayYYYYMMDD != null
      ? formatYYYYMMDDForDisplay(expandedDayYYYYMMDD.slice(0, 8))
      : "";

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
        {cellRows.map((row, rowIdx) => (
          <View key={rowIdx} style={styles.gridRow}>
            {row.map((cell) => {
              const dayKey = normalizeDayKey(cell.yyyymmdd);
              const detail = detailsByDay.get(dayKey);
              const logged = detail?.numCompleted ?? 0;
              const inGoalRange =
                cell.yyyymmdd >= trackable.startDayYYYYMMDD &&
                cell.yyyymmdd <= trackable.endDayYYYYMMDD;
              const done = logged > 0 && inGoalRange;
              const faded = cell.inMonth === false || !inGoalRange;
              const isToday = cell.yyyymmdd === todayYYYYMMDD();
              const tasks = detail?.completedTaskNames ?? [];
              const visibleTasks = tasks.slice(0, MAX_TASK_LINES);
              const moreTaskCount = tasks.length - visibleTasks.length;
              const comment = (detail?.comments ?? "").trim();
              const dom = parseInt(cell.yyyymmdd.slice(6, 8), 10);

              const a11yParts = [
                `${dom}`,
                inGoalRange ? "in goal range" : "outside goal range",
                logged > 0 ? `progress ${logged}` : null,
                tasks.length ? `tasks: ${tasks.join(", ")}` : null,
                moreTaskCount > 0 ? `${moreTaskCount} more tasks not listed` : null,
                comment ? `comment: ${comment}` : null,
              ].filter(Boolean);

              const a11yHint = "Opens full details for this day";

              return (
                <Pressable
                  key={cell.yyyymmdd}
                  onPress={() => setExpandedDayYYYYMMDD(cell.yyyymmdd)}
                  style={({ pressed }) => [
                    styles.dayCell,
                    done ? styles.dayDone : null,
                    faded ? styles.dayFaded : null,
                    isToday ? styles.dayTodayBorder : null,
                    pressed ? styles.dayCellPressed : null,
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={a11yParts.join(". ")}
                  accessibilityHint={a11yHint}
                >
                  <Text style={[styles.dayNumCorner, faded && styles.dayNumCornerFaded]}>
                    {dom}
                  </Text>
                  <View style={styles.dayCellBody}>
                    {logged > 0 ? (
                      <Text
                        style={[
                          styles.contributionNum,
                          faded && styles.contributionNumFaded,
                          done && styles.contributionNumDone,
                        ]}
                      >
                        {logged}
                      </Text>
                    ) : null}
                    {visibleTasks.map((name, ti) => (
                      <Text
                        key={`${cell.yyyymmdd}-t-${ti}`}
                        style={[styles.taskLine, faded && styles.metaFaded]}
                        numberOfLines={2}
                        ellipsizeMode="tail"
                        accessibilityLabel={name}
                      >
                        ✓ {name}
                      </Text>
                    ))}
                    {moreTaskCount > 0 ? (
                      <Text
                        style={[styles.moreTasksLine, faded && styles.metaFaded]}
                        accessibilityLabel={`${moreTaskCount} more completed tasks`}
                      >
                        +{moreTaskCount} more
                      </Text>
                    ) : null}
                    {comment ? (
                      <Text
                        style={[styles.commentLine, faded && styles.metaFaded]}
                        numberOfLines={3}
                        ellipsizeMode="tail"
                        accessibilityLabel={comment}
                      >
                        💬 {comment}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {calendarLoading ? (
        <Text style={styles.loadingHint}>Loading progress…</Text>
      ) : null}

      <Modal
        visible={expandedDayYYYYMMDD != null}
        transparent
        animationType="fade"
        onRequestClose={() => setExpandedDayYYYYMMDD(null)}
      >
        <View style={styles.modalRoot}>
          <DialogOverlay onBackdropPress={() => setExpandedDayYYYYMMDD(null)}>
            <DialogCard desktopWidth={440} style={styles.dayDetailCard}>
              <DialogHeader
                title={expandedDayLabel || "Day details"}
                onClose={() => setExpandedDayYYYYMMDD(null)}
              />
              <ScrollView
                style={styles.dayDetailScroll}
                keyboardShouldPersistTaps="handled"
              >
                {expandedDayYYYYMMDD != null ? (
                  <DayDetailModalBody
                    yyyymmdd={expandedDayYYYYMMDD}
                    trackable={trackable}
                    detail={expandedDetail}
                  />
                ) : null}
              </ScrollView>
            </DialogCard>
          </DialogOverlay>
        </View>
      </Modal>
    </View>
  );
}

function DayDetailModalBody({
  yyyymmdd,
  trackable,
  detail,
}: {
  yyyymmdd: string;
  trackable: ProgressTabTrackable;
  detail: DayDetail | undefined;
}) {
  const inGoalRange =
    yyyymmdd >= trackable.startDayYYYYMMDD &&
    yyyymmdd <= trackable.endDayYYYYMMDD;
  const logged = detail?.numCompleted ?? 0;
  const tasks = detail?.completedTaskNames ?? [];
  const comment = (detail?.comments ?? "").trim();
  const hasAny = logged > 0 || tasks.length > 0 || comment.length > 0;

  return (
    <View style={styles.modalBody}>
      {!inGoalRange ? (
        <Text style={styles.modalMuted}>
          Outside this trackable's goal date range.
        </Text>
      ) : null}
      <View style={styles.modalSection}>
        <Text style={styles.modalSectionLabel}>Contribution (count)</Text>
        <Text style={styles.modalBodyText}>{logged > 0 ? String(logged) : "—"}</Text>
      </View>
      <View style={styles.modalSection}>
        <Text style={styles.modalSectionLabel}>
          Completed tasks ({tasks.length})
        </Text>
        {tasks.length === 0 ? (
          <Text style={styles.modalMuted}>—</Text>
        ) : (
          tasks.map((name, i) => (
            <Text key={`${i}-${name.slice(0, 48)}`} style={styles.modalBullet}>
              ✓ {name}
            </Text>
          ))
        )}
      </View>
      <View style={styles.modalSection}>
        <Text style={styles.modalSectionLabel}>Comment</Text>
        <Text style={styles.modalBodyText}>{comment.length > 0 ? comment : "—"}</Text>
      </View>
      {!hasAny && inGoalRange ? (
        <Text style={styles.modalMuted}>
          No logged count, attributing task completions, or comments for this day.
        </Text>
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
    marginTop: GAP,
    gap: GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap: GAP,
    alignItems: "flex-start",
  },
  dayCell: {
    flex: 1,
    minWidth: 0,
    aspectRatio: 1,
    position: "relative",
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
    padding: 5,
    paddingTop: 4,
    overflow: "hidden",
  },
  dayCellPressed: {
    opacity: 0.88,
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
  dayNumCorner: {
    position: "absolute",
    top: 5,
    right: 6,
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
    zIndex: 1,
  },
  dayNumCornerFaded: {
    color: Colors.textTertiary,
  },
  dayCellBody: {
    flex: 1,
    width: "100%",
    marginTop: 18,
    gap: 4,
    justifyContent: "flex-start",
  },
  contributionNum: {
    fontSize: 22,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 26,
  },
  contributionNumFaded: {
    color: Colors.textTertiary,
  },
  contributionNumDone: {
    color: Colors.onPrimaryContainer,
  },
  taskLine: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.text,
    lineHeight: 17,
  },
  commentLine: {
    fontSize: 13,
    fontWeight: "400",
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  moreTasksLine: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    lineHeight: 16,
    fontStyle: "italic",
  },
  metaFaded: {
    color: Colors.textTertiary,
  },
  loadingHint: { fontSize: 12, color: Colors.textSecondary, marginTop: 6 },
  modalRoot: {
    flex: 1,
  },
  dayDetailCard: {
    padding: 20,
    maxHeight: "85%",
  },
  dayDetailScroll: {
    flexGrow: 0,
    maxHeight: 360,
  },
  modalBody: {
    gap: 16,
    paddingBottom: 8,
  },
  modalSection: {
    gap: 6,
  },
  modalSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  modalBodyText: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 22,
  },
  modalBullet: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 22,
    marginTop: 4,
  },
  modalMuted: {
    fontSize: 14,
    color: Colors.textTertiary,
    fontStyle: "italic",
    lineHeight: 20,
  },
});
