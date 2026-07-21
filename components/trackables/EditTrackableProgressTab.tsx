import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  Modal,
  ScrollView,
} from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDD,
  formatYYYYMMDDForDisplay,
  formatSecondsAsHM,
  parseYYYYMMDD,
  startOfMonth,
  todayYYYYMMDD,
} from "../../lib/dates";
import { useAuth } from "../../hooks/useAuth";
import { dialogOverlayStyles } from "../ui/dialogOverlayShared";
import { DialogCard, DialogHeader } from "../ui/DialogScaffold";
import { Button } from "../ui/Button";
import { TrackCountDialog } from "./widgets/dialogs/TrackCountDialog";
import { TrackPeriodicDialog } from "./widgets/dialogs/TrackPeriodicDialog";
import { TrackTimeDialog } from "./widgets/dialogs/TrackTimeDialog";
import { TrackTrackerDialog } from "./widgets/dialogs/TrackTrackerDialog";

type GoalProgressType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

type ProgressTabTrackable = {
  _id: Id<"trackables">;
  trackableType: GoalProgressType;
  name: string;
  colour: string;
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  targetCount?: number;
  targetNumberOfHours?: number;
  targetNumberOfDaysAWeek?: number;
  targetNumberOfMinutesAWeek?: number;
  targetNumberOfWeeks?: number;
  /** TRACKER-only flags — which fields its log dialog shows. */
  trackCount?: boolean;
  trackTime?: boolean;
  isRatingTracker?: boolean;
};

type DayDetail = {
  numCompleted: number;
  comments: string;
  completedTaskNames: string[];
  /** Actively logged time attributed to the trackable (`getTrackableAnalyticsSeries`). */
  secondsAttributed?: number;
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

/** Compact hours label for calendar cells (matches TimeTrackWidget rounding). */
function formatHoursFromSeconds(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "";
  const h = totalSeconds / 3600;
  const r = Math.round(h * 10) / 10;
  return `${r.toFixed(1).replace(/\.0$/, "")}h`;
}

/** In-cell preview lines; full lists open in the day-detail modal. */
const MAX_TASK_LINES = 2;

/** Calendar grid gap between cells. */
const GAP = 4;

export function EditTrackableProgressTab({
  trackable,
  readOnly = false,
}: {
  trackable: ProgressTabTrackable;
  /** Hides the "Add progress" action — the goal already hit its target. */
  readOnly?: boolean;
}) {
  const { profileReady } = useAuth();
  const type = trackable.trackableType;
  const caption = progressCaption(trackable);
  const showCalendar =
    type === "NUMBER" ||
    type === "TIME_TRACK" ||
    type === "DAYS_A_WEEK" ||
    type === "MINUTES_A_WEEK" ||
    type === "TRACKER";

  const defaultAnchor = clipYYYYMMDD(todayYYYYMMDD(), trackable.startDayYYYYMMDD, trackable.endDayYYYYMMDD);
  const [viewAnchor, setViewAnchor] = useState(defaultAnchor);
  const [expandedDayYYYYMMDD, setExpandedDayYYYYMMDD] = useState<string | null>(
    null,
  );
  /** Day the user is logging progress for (opens the type-matched dialog). */
  const [logDayYYYYMMDD, setLogDayYYYYMMDD] = useState<string | null>(null);

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

  // Lifetime average denominators inside the query require a client-supplied
  // `today` so the handler stays deterministic and cacheable.
  const todayCompact = useMemo(() => todayYYYYMMDD(), []);

  const showsTime = type === "TIME_TRACK" || type === "TRACKER";

  const analyticsSeries = useQuery(
    api.trackables.getTrackableAnalyticsSeries,
    profileReady && showsTime && calendarBounds
      ? {
          windowStart: calendarBounds.start,
          windowEnd: calendarBounds.end,
          today: todayCompact,
        }
      : "skip",
  );

  // TRACKER progress lives in `trackerEntries` (per-entry count/duration),
  // not `trackableDays` — pull the month's entries for count + comments.
  const trackerEntries = useQuery(
    api.trackerEntries.search,
    profileReady && type === "TRACKER" && calendarBounds
      ? {
          trackableId: trackable._id,
          startDay: calendarBounds.start,
          endDay: calendarBounds.end,
          limit: 2000,
        }
      : "skip",
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
          listToTrackable.set(
            list._id,
            list.trackableId as Id<"trackables">,
          );
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

    if (showsTime && analyticsSeries) {
      const goal = analyticsSeries.trackables.find((t) => t._id === trackable._id);
      if (goal) {
        for (const d of goal.days) {
          const key = normalizeDayKey(d.day);
          if (key.length !== 8) continue;
          const sec = d.secondsAttributed ?? 0;
          const prev = m.get(key);
          if (prev) {
            prev.secondsAttributed = sec;
          } else if (sec > 0) {
            m.set(key, {
              numCompleted: 0,
              comments: "",
              completedTaskNames: [],
              secondsAttributed: sec,
            });
          }
        }
      }
    }

    // TRACKER: fold per-entry counts and comments into the day buckets
    // (time already arrives via `analyticsSeries`, which sums tracker
    // entry durations alongside attributed timeWindows).
    if (type === "TRACKER" && trackerEntries) {
      for (const entry of trackerEntries.entries) {
        const key = normalizeDayKey(entry.dayYYYYMMDD);
        if (key.length !== 8) continue;
        const existing = m.get(key);
        const count = entry.countValue ?? 0;
        const comment = (entry.comments ?? "").trim();
        if (!existing) {
          m.set(key, {
            numCompleted: count,
            comments: comment,
            completedTaskNames: [],
          });
        } else {
          existing.numCompleted += count;
          if (comment) {
            existing.comments = existing.comments
              ? `${existing.comments} · ${comment}`
              : comment;
          }
        }
      }
    }

    return m;
  }, [
    type,
    showsTime,
    analyticsSeries,
    trackerEntries,
    daysSearch,
    completedWindowTasks,
    listsSearch,
    trackable._id,
  ]);

  const calendarLoading =
    daysSearch === undefined ||
    completedWindowTasks === undefined ||
    listsSearch === undefined ||
    (showsTime && analyticsSeries === undefined) ||
    (type === "TRACKER" && trackerEntries === undefined);

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

  const closeLogDialog = useCallback(() => setLogDayYYYYMMDD(null), []);

  /** Opens the type-matched quick-log dialog pre-set to the given day. */
  const openLogDialogForDay = useCallback((yyyymmdd: string) => {
    // Close the RN-Modal day sheet FIRST: on web the log dialogs portal
    // to document.body, which sits under an open RN Modal layer.
    setExpandedDayYYYYMMDD(null);
    setLogDayYYYYMMDD(normalizeDayKey(yyyymmdd));
  }, []);

  const renderLogDialog = (day: string) => {
    const detail = detailsByDay.get(normalizeDayKey(day));
    const manual = detail?.numCompleted ?? 0;
    const taskCount = detail?.completedTaskNames.length ?? 0;
    const common = {
      trackableId: trackable._id,
      trackableName: trackable.name,
      trackableColour: trackable.colour,
      dayYYYYMMDD: day,
      onClose: closeLogDialog,
    };
    switch (type) {
      case "NUMBER":
        return (
          <TrackCountDialog
            {...common}
            // Widget parity: the stepper shows the day's TOTAL
            // (manual + attributed task completions).
            initialCount={manual + taskCount}
            initialComments={detail?.comments ?? ""}
          />
        );
      case "DAYS_A_WEEK":
        return (
          <TrackPeriodicDialog
            {...common}
            initialNumCompleted={manual + taskCount}
            initialComments={detail?.comments ?? ""}
          />
        );
      case "TIME_TRACK":
      case "MINUTES_A_WEEK":
        return <TrackTimeDialog {...common} />;
      case "TRACKER":
        return (
          <TrackTrackerDialog
            {...common}
            trackCount={trackable.trackCount ?? false}
            trackTime={trackable.trackTime ?? false}
            isRatingTracker={trackable.isRatingTracker ?? false}
          />
        );
      default:
        return null;
    }
  };

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
              const sec = detail?.secondsAttributed ?? 0;
              const hoursLabel = formatHoursFromSeconds(sec);
              const inGoalRange =
                cell.yyyymmdd >= trackable.startDayYYYYMMDD &&
                cell.yyyymmdd <= trackable.endDayYYYYMMDD;
              const tasksArr = detail?.completedTaskNames ?? [];
              const faded = cell.inMonth === false || !inGoalRange;
              const isToday = cell.yyyymmdd === todayYYYYMMDD();
              const hasTimeProgress = showsTime && sec > 0;
              const hasCountProgress = type !== "TIME_TRACK" && logged > 0;
              const done =
                inGoalRange &&
                (hasTimeProgress ||
                  hasCountProgress ||
                  (type === "TIME_TRACK" &&
                    (logged > 0 || tasksArr.length > 0)));
              const visibleTasks = tasksArr.slice(0, MAX_TASK_LINES);
              const moreTaskCount = tasksArr.length - visibleTasks.length;
              const comment = (detail?.comments ?? "").trim();
              const dom = parseInt(cell.yyyymmdd.slice(6, 8), 10);

              const a11yParts = [
                `${dom}`,
                inGoalRange ? "in goal range" : "outside goal range",
                type === "TIME_TRACK" && sec > 0
                  ? `time logged ${formatSecondsAsHM(sec)}`
                  : null,
                type !== "TIME_TRACK" && logged > 0 ? `progress ${logged}` : null,
                tasksArr.length ? `tasks: ${tasksArr.join(", ")}` : null,
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
                    {type === "TIME_TRACK" && hasTimeProgress ? (
                      <Text
                        style={[
                          styles.contributionNum,
                          faded && styles.contributionNumFaded,
                          done && styles.contributionNumDone,
                        ]}
                      >
                        {hoursLabel}
                      </Text>
                    ) : type !== "TIME_TRACK" && logged > 0 ? (
                      <Text
                        style={[
                          styles.contributionNum,
                          faded && styles.contributionNumFaded,
                          done && styles.contributionNumDone,
                        ]}
                      >
                        {logged}
                      </Text>
                    ) : type === "TRACKER" && hasTimeProgress ? (
                      <Text
                        style={[
                          styles.contributionNum,
                          faded && styles.contributionNumFaded,
                          done && styles.contributionNumDone,
                        ]}
                      >
                        {hoursLabel}
                      </Text>
                    ) : null}
                    {visibleTasks.map((name, ti) => (
                      <Text
                        key={`${cell.yyyymmdd}-t-${ti}`}
                        style={[styles.taskLine, faded && styles.metaFaded]}
                        numberOfLines={1}
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
                        numberOfLines={2}
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
          {/*
            Inline backdrop (not DialogOverlay): on web, DialogOverlay portals to
            document.body, which leaves clicks under RN Modal's layer — Escape still
            works via onRequestClose but the header X does not.
          */}
          <Pressable
            style={[
              dialogOverlayStyles.overlay,
              dialogOverlayStyles.overlayCenter,
              { zIndex: 1000 },
            ]}
            onPress={() => setExpandedDayYYYYMMDD(null)}
          >
            <Pressable onPress={(e) => e.stopPropagation?.()}>
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
                {!readOnly && (
                  <View style={styles.dayDetailFooter}>
                    <Button
                      title="Add progress"
                      size="small"
                      icon={
                        <Ionicons name="add" size={18} color={Colors.onPrimary} />
                      }
                      onPress={() => {
                        if (expandedDayYYYYMMDD != null) {
                          openLogDialogForDay(expandedDayYYYYMMDD);
                        }
                      }}
                    />
                  </View>
                )}
              </DialogCard>
            </Pressable>
          </Pressable>
        </View>
      </Modal>

      {/*
        Quick-log dialog for the day picked in the calendar. On native the
        Track* dialogs' DialogOverlay is ABSOLUTE-positioned — rendered this
        deep inside the edit dialog's card it would be clipped to the tab
        area, so it needs an RN Modal to escape to the root layer. On web
        the overlay portals to document.body (position: fixed), where an RN
        Modal wrapper would instead BLOCK its clicks — so render it bare.
      */}
      {logDayYYYYMMDD != null ? (
        Platform.OS === "web" ? (
          renderLogDialog(logDayYYYYMMDD)
        ) : (
          <Modal
            visible
            transparent
            animationType="fade"
            onRequestClose={closeLogDialog}
          >
            {renderLogDialog(logDayYYYYMMDD)}
          </Modal>
        )
      ) : null}
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
  const sec = detail?.secondsAttributed ?? 0;
  const tasks = detail?.completedTaskNames ?? [];
  const comment = (detail?.comments ?? "").trim();
  const hasAny =
    logged > 0 ||
    sec > 0 ||
    tasks.length > 0 ||
    comment.length > 0;

  return (
    <View style={styles.modalBody}>
      {!inGoalRange ? (
        <Text style={styles.modalMuted}>
          Outside this trackable's goal date range.
        </Text>
      ) : null}
      <View style={styles.modalSection}>
        <Text style={styles.modalSectionLabel}>
          {trackable.trackableType === "TIME_TRACK" ? "Time logged" : "Contribution (count)"}
        </Text>
        <Text style={styles.modalBodyText}>
          {trackable.trackableType === "TIME_TRACK"
            ? sec > 0
              ? formatSecondsAsHM(sec)
              : "—"
            : logged > 0
              ? String(logged)
              : "—"}
        </Text>
      </View>
      {trackable.trackableType === "TRACKER" && sec > 0 ? (
        <View style={styles.modalSection}>
          <Text style={styles.modalSectionLabel}>Time logged</Text>
          <Text style={styles.modalBodyText}>{formatSecondsAsHM(sec)}</Text>
        </View>
      ) : null}
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
          {trackable.trackableType === "TIME_TRACK"
            ? "No logged time, attributing task completions, or comments for this day."
            : "No logged count, attributing task completions, or comments for this day."}
        </Text>
      ) : null}
    </View>
  );
}

function progressCaption(t: ProgressTabTrackable): string | undefined {
  switch (t.trackableType) {
    case "NUMBER":
      return `Target: ${t.targetCount != null ? String(t.targetCount) : "—"}`;
    case "TIME_TRACK": {
      const h =
        t.targetNumberOfHours != null ? String(t.targetNumberOfHours) : "—";
      return `Target: ${h} hours total`;
    }
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
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
    padding: 3,
    paddingTop: 2,
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
    top: 3,
    right: 4,
    fontSize: 11,
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
    marginTop: 12,
    gap: 2,
    justifyContent: "flex-start",
  },
  contributionNum: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    lineHeight: 18,
  },
  contributionNumFaded: {
    color: Colors.textTertiary,
  },
  contributionNumDone: {
    color: Colors.onPrimaryContainer,
  },
  taskLine: {
    fontSize: 9,
    fontWeight: "500",
    color: Colors.text,
    lineHeight: 12,
  },
  commentLine: {
    fontSize: 9,
    fontWeight: "400",
    color: Colors.textSecondary,
    lineHeight: 12,
  },
  moreTasksLine: {
    fontSize: 9,
    fontWeight: "600",
    color: Colors.textSecondary,
    lineHeight: 12,
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
  dayDetailFooter: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineVariant,
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
