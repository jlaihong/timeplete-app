/**
 * Week and month views for the Calendar page.
 *
 * The day view (`CalendarView`) is where events are dragged, resized and
 * timed. These two are for looking further out: they show the same events
 * read-only, and lead back to the day view or the event dialog.
 *
 *   - Week: seven day columns on a shared time grid. Press an event to
 *     edit it, an empty slot to add one there, a day's heading to open
 *     that day.
 *   - Month: one cell per day with as many event titles as fit. Press a
 *     day to open it.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatSecondsAsHM,
  getDayOfWeekLetter,
  getDaysInRange,
  parseYYYYMMDD,
  startOfMonth,
  startOfWeek,
  todayYYYYMMDD,
} from "../../lib/dates";
import { DEFAULT_EVENT_COLOR } from "../../lib/eventColors";
import { plainMentions } from "../../lib/mentions";
import type {
  AddEventPrefill,
  EditEventPayload,
} from "../shared/CalendarView";
import {
  DAY_MINUTES,
  DEFAULT_CREATE_DURATION_MINUTES,
  TimeWindowDoc,
  eventGridStartMinutes,
  formatClockTime,
  minutesToHHMM,
  packOverlappingEvents,
  withAlpha,
} from "../shared/CalendarViewShared";

export type CalendarMode = "day" | "week" | "month";

interface RangeViewProps {
  /** Any day inside the week or month being shown. */
  anchorDay: string;
  onAnchorDayChange: (day: string) => void;
  /** Switch to the day view on this day. */
  onOpenDay: (day: string) => void;
  onAddEvent: (day: string, prefill?: AddEventPrefill) => void;
  onEditEvent: (event: EditEventPayload) => void;
}

/* ───────────────────────────── shared ───────────────────────────── */

function gridTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function titleOf(tw: TimeWindowDoc): string {
  return plainMentions(
    (tw.displayTitle && tw.displayTitle.trim()) || "Untitled",
  );
}

function toEditPayload(tw: TimeWindowDoc): EditEventPayload {
  return {
    _id: String(tw._id),
    title: tw.title,
    derivedTitle: tw.derivedTitle,
    startTimeHHMM: tw.startTimeHHMM,
    startDayYYYYMMDD: tw.startDayYYYYMMDD,
    durationSeconds: tw.durationSeconds,
    activityType: tw.activityType,
    budgetType: tw.budgetType,
    comments: tw.comments,
    trackableId: tw.trackableId,
    trackableIds: tw.trackableIds,
    attributedTrackableIds: tw.attributedTrackableIds,
    listId: tw.listId,
    taskId: tw.taskId,
    recurringEventId: tw.recurringEventId,
    isRecurringInstance: !!tw.isRecurringInstance,
    timeZone: tw.timeZone,
    useTimeZone: tw.useTimeZone === true,
  };
}

/**
 * Events between two days, grouped by day and sorted by start time.
 * Also asks the server to write out recurring events for the range, the
 * way the day view does for its one day.
 */
function useRangeEvents(startDay: string, endDay: string) {
  const { profileReady } = useAuth();
  const rows = useQuery(
    api.timeWindows.search,
    profileReady ? { startDay, endDay } : "skip",
  ) as TimeWindowDoc[] | undefined;
  const rules = useQuery(
    (api as any).recurringEvents.list,
    profileReady ? {} : "skip",
  ) as { _id: string }[] | undefined;
  const generateInstances = useMutation(
    (api as any).recurringEvents.generateInstances,
  );
  const rulesKey = rules?.map((r) => r._id).join(",");
  useEffect(() => {
    if (rulesKey === undefined) return;
    void generateInstances({
      rangeStartYYYYMMDD: startDay,
      rangeEndYYYYMMDD: endDay,
    });
  }, [startDay, endDay, rulesKey, generateInstances]);

  return useMemo(() => {
    const zone = gridTimeZone();
    const byDay = new Map<string, TimeWindowDoc[]>();
    let trackedSeconds = 0;
    for (const tw of rows ?? []) {
      const list = byDay.get(tw.startDayYYYYMMDD);
      if (list) list.push(tw);
      else byDay.set(tw.startDayYYYYMMDD, [tw]);
      if (tw.budgetType === "ACTUAL") trackedSeconds += tw.durationSeconds;
    }
    for (const list of byDay.values()) {
      list.sort(
        (a, b) =>
          eventGridStartMinutes(a, zone) - eventGridStartMinutes(b, zone),
      );
    }
    return {
      byDay,
      count: rows?.length ?? 0,
      trackedSeconds,
      loading: rows === undefined,
    };
  }, [rows]);
}

function summaryOf(count: number, trackedSeconds: number): string {
  const events =
    count === 0 ? "No events" : count === 1 ? "1 event" : `${count} events`;
  return trackedSeconds > 0
    ? `${events} · ${formatSecondsAsHM(trackedSeconds)} tracked`
    : events;
}

/** Title on the left; Today, previous and next on the right. */
function RangeNav({
  title,
  subtitle,
  showToday,
  unit,
  onToday,
  onStep,
}: {
  title: string;
  subtitle: string;
  showToday: boolean;
  unit: "week" | "month";
  onToday: () => void;
  onStep: (direction: -1 | 1) => void;
}) {
  return (
    <View style={styles.nav}>
      <View style={styles.navHeading}>
        <Text style={styles.navTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.navSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {showToday && (
        <TouchableOpacity
          style={styles.todayButton}
          onPress={onToday}
          accessibilityRole="button"
          accessibilityLabel="Go to today"
        >
          <Text style={styles.todayButtonText}>Today</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => onStep(-1)}
        accessibilityRole="button"
        accessibilityLabel={`Previous ${unit}`}
      >
        <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.navButton}
        onPress={() => onStep(1)}
        accessibilityRole="button"
        accessibilityLabel={`Next ${unit}`}
      >
        <Ionicons
          name="chevron-forward"
          size={20}
          color={Colors.textSecondary}
        />
      </TouchableOpacity>
    </View>
  );
}

/** Day / Week / Month switch shown at the top of the Calendar page. */
export function CalendarModeSwitch({
  mode,
  onChange,
}: {
  mode: CalendarMode;
  onChange: (mode: CalendarMode) => void;
}) {
  const item = (key: CalendarMode, label: string) => {
    const selected = key === mode;
    return (
      <Pressable
        key={key}
        onPress={() => onChange(key)}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={[styles.switchItem, selected && styles.switchItemActive]}
      >
        <Text style={[styles.switchLabel, selected && styles.switchLabelActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.switchWrap} accessibilityRole="tablist">
      {item("day", "Day")}
      {item("week", "Week")}
      {item("month", "Month")}
    </View>
  );
}

/* ────────────────────────────── week ────────────────────────────── */

const WEEK_PX_PER_MINUTE = 0.8;
const WEEK_HOUR_HEIGHT = 60 * WEEK_PX_PER_MINUTE;
const WEEK_DAY_HEIGHT = DAY_MINUTES * WEEK_PX_PER_MINUTE;
/** Shortest an event is drawn: one line of title. */
const WEEK_MIN_EVENT_HEIGHT = 15;
const WEEK_LABELS_WIDTH = 40;
/** A press on empty space starts an event on the half hour under it. */
const WEEK_CREATE_SNAP_MINUTES = 30;

function hourLabel(h: number): string {
  if (h === 0) return "12 AM";
  if (h < 12) return `${h} AM`;
  if (h === 12) return "12 PM";
  return `${h - 12} PM`;
}

function weekTitle(monday: string, sunday: string): string {
  const a = parseYYYYMMDD(monday);
  const b = parseYYYYMMDD(sunday);
  const month = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short" });
  return a.getMonth() === b.getMonth()
    ? `${month(a)} ${a.getDate()} – ${b.getDate()}`
    : `${month(a)} ${a.getDate()} – ${month(b)} ${b.getDate()}`;
}

export function CalendarWeekView({
  anchorDay,
  onAnchorDayChange,
  onOpenDay,
  onAddEvent,
  onEditEvent,
}: RangeViewProps) {
  const monday = startOfWeek(anchorDay);
  const sunday = endOfWeek(anchorDay);
  const days = useMemo(() => getDaysInRange(monday, sunday), [monday, sunday]);
  const { byDay, count, trackedSeconds } = useRangeEvents(monday, sunday);
  const today = todayYYYYMMDD();
  const zone = gridTimeZone();

  // Re-read the clock each minute so the "now" line keeps moving.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Open on the working day rather than midnight: an hour above now when
  // this week holds today, otherwise 7 AM.
  const scrollRef = useRef<ScrollView>(null);
  const holdsToday = today >= monday && today <= sunday;
  useEffect(() => {
    const minutes = holdsToday ? Math.max(0, nowMinutes - 60) : 7 * 60;
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({
        y: minutes * WEEK_PX_PER_MINUTE,
        animated: false,
      });
    }, 0);
    return () => clearTimeout(id);
    // Only when the week changes, not every minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monday]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  return (
    <View style={styles.fill}>
      <RangeNav
        title={weekTitle(monday, sunday)}
        subtitle={`${parseYYYYMMDD(sunday).getFullYear()} · ${summaryOf(count, trackedSeconds)}`}
        showToday={!holdsToday}
        unit="week"
        onToday={() => onAnchorDayChange(today)}
        onStep={(direction) => onAnchorDayChange(addDays(anchorDay, 7 * direction))}
      />

      <View style={styles.weekHeader}>
        <View style={{ width: WEEK_LABELS_WIDTH }} />
        {days.map((day) => {
          const isToday = day === today;
          const date = parseYYYYMMDD(day);
          return (
            <Pressable
              key={day}
              style={styles.weekHeaderDay}
              onPress={() => onOpenDay(day)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${date.toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
              })}`}
            >
              <Text style={[styles.weekLetter, isToday && styles.textToday]}>
                {getDayOfWeekLetter(day)}
              </Text>
              <View style={[styles.weekNumber, isToday && styles.numberToday]}>
                <Text
                  style={[
                    styles.weekNumberText,
                    isToday && styles.numberTodayText,
                  ]}
                >
                  {date.getDate()}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.fill}
        contentContainerStyle={styles.weekScrollContent}
      >
        <View style={[styles.weekSurface, { height: WEEK_DAY_HEIGHT }]}>
          <View style={{ width: WEEK_LABELS_WIDTH }}>
            {hours.map((h) => (
              <View key={h} style={styles.weekHourLabelRow}>
                <Text style={styles.weekHourLabel}>{hourLabel(h)}</Text>
              </View>
            ))}
          </View>

          {days.map((day) => {
            const events = byDay.get(day) ?? [];
            const layout = packOverlappingEvents(events, zone);
            return (
              <Pressable
                key={day}
                style={styles.weekColumn}
                accessibilityLabel={`Add an event on ${parseYYYYMMDD(
                  day,
                ).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}`}
                onPress={(e) => {
                  // Native reports the press within the column; a web
                  // click only has viewport coordinates.
                  const native = e.nativeEvent as any;
                  let y: number = native.locationY ?? 0;
                  if (Platform.OS === "web") {
                    const rect = (
                      e.currentTarget as any
                    )?.getBoundingClientRect?.();
                    if (rect && typeof native.clientY === "number") {
                      y = native.clientY - rect.top;
                    } else if (typeof native.offsetY === "number") {
                      y = native.offsetY;
                    }
                  }
                  const raw = y / WEEK_PX_PER_MINUTE;
                  const snapped =
                    Math.floor(raw / WEEK_CREATE_SNAP_MINUTES) *
                    WEEK_CREATE_SNAP_MINUTES;
                  const start = Math.min(
                    Math.max(0, snapped),
                    DAY_MINUTES - DEFAULT_CREATE_DURATION_MINUTES,
                  );
                  onAddEvent(day, {
                    startTimeHHMM: minutesToHHMM(start),
                    durationMinutes: DEFAULT_CREATE_DURATION_MINUTES,
                  });
                }}
              >
                {hours.map((h) => (
                  <View
                    key={h}
                    pointerEvents="none"
                    style={[styles.weekHourLine, { top: h * WEEK_HOUR_HEIGHT }]}
                  />
                ))}
                {events.map((tw) => {
                  const start = eventGridStartMinutes(tw, zone);
                  const minutes = Math.round(tw.durationSeconds / 60);
                  const lane = layout.get(tw._id) ?? { lane: 0, laneCount: 1 };
                  const colour = tw.displayColor ?? DEFAULT_EVENT_COLOR;
                  const planned = tw.budgetType === "BUDGETED";
                  const height = Math.max(
                    WEEK_MIN_EVENT_HEIGHT,
                    minutes * WEEK_PX_PER_MINUTE,
                  );
                  const title = titleOf(tw);
                  return (
                    <Pressable
                      key={tw._id}
                      onPress={() => onEditEvent(toEditPayload(tw))}
                      accessibilityRole="button"
                      accessibilityLabel={`${title}, ${formatClockTime(start)}, ${formatSecondsAsHM(tw.durationSeconds)}`}
                      style={[
                        styles.weekEvent,
                        {
                          top: start * WEEK_PX_PER_MINUTE,
                          height,
                          left: `${(lane.lane / lane.laneCount) * 100}%`,
                          width: `${100 / lane.laneCount}%`,
                          backgroundColor: withAlpha(
                            colour,
                            planned ? "26" : "4D",
                          ),
                          borderLeftColor: colour,
                        },
                        planned && styles.weekEventPlanned,
                      ]}
                    >
                      <Text
                        style={styles.weekEventText}
                        numberOfLines={Math.max(1, Math.floor(height / 13))}
                      >
                        {title}
                      </Text>
                    </Pressable>
                  );
                })}
                {day === today && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.nowLine,
                      { top: nowMinutes * WEEK_PX_PER_MINUTE },
                    ]}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

/* ────────────────────────────── month ───────────────────────────── */

/** Room a month cell keeps for its day number. */
const MONTH_CELL_HEADER = 26;
const MONTH_EVENT_LINE = 17;

export function CalendarMonthView({
  anchorDay,
  onAnchorDayChange,
  onOpenDay,
}: RangeViewProps) {
  const first = startOfMonth(anchorDay);
  const last = endOfMonth(anchorDay);
  const gridStart = startOfWeek(first);
  const gridEnd = endOfWeek(last);
  const weeks = useMemo(() => {
    const all = getDaysInRange(gridStart, gridEnd);
    const out: string[][] = [];
    for (let i = 0; i < all.length; i += 7) out.push(all.slice(i, i + 7));
    return out;
  }, [gridStart, gridEnd]);
  const { byDay } = useRangeEvents(gridStart, gridEnd);
  const today = todayYYYYMMDD();
  const zone = gridTimeZone();
  const month = first.slice(0, 6);

  // Totals are for the month itself, not the grey days around it.
  const { count, trackedSeconds } = useMemo(() => {
    let n = 0;
    let seconds = 0;
    for (const [day, events] of byDay) {
      if (day.slice(0, 6) !== month) continue;
      n += events.length;
      for (const tw of events) {
        if (tw.budgetType === "ACTUAL") seconds += tw.durationSeconds;
      }
    }
    return { count: n, trackedSeconds: seconds };
  }, [byDay, month]);

  // As many event lines as the cells have room for.
  const [gridHeight, setGridHeight] = useState(0);
  const cellHeight = gridHeight > 0 ? gridHeight / weeks.length : 0;
  const maxLines = Math.max(
    0,
    Math.floor((cellHeight - MONTH_CELL_HEADER) / MONTH_EVENT_LINE),
  );

  const stepMonth = (direction: -1 | 1) => {
    const d = parseYYYYMMDD(first);
    const target = new Date(d.getFullYear(), d.getMonth() + direction, 1);
    const y = target.getFullYear();
    const m = String(target.getMonth() + 1).padStart(2, "0");
    onAnchorDayChange(`${y}${m}01`);
  };

  return (
    <View style={styles.fill}>
      <RangeNav
        title={parseYYYYMMDD(first).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        })}
        subtitle={summaryOf(count, trackedSeconds)}
        showToday={today.slice(0, 6) !== month}
        unit="month"
        onToday={() => onAnchorDayChange(today)}
        onStep={stepMonth}
      />

      <View style={styles.monthLetters}>
        {weeks[0].map((day) => (
          <Text key={day} style={styles.monthLetter}>
            {getDayOfWeekLetter(day)}
          </Text>
        ))}
      </View>

      <View
        style={styles.monthGrid}
        onLayout={(e) => setGridHeight(e.nativeEvent.layout.height)}
      >
        {weeks.map((week) => (
          <View key={week[0]} style={styles.monthWeek}>
            {week.map((day) => {
              const events = byDay.get(day) ?? [];
              const inMonth = day.slice(0, 6) === month;
              const isToday = day === today;
              // Keep the last line for "+N" when not everything fits.
              const shown =
                events.length > maxLines
                  ? events.slice(0, Math.max(0, maxLines - 1))
                  : events;
              const hidden = events.length - shown.length;
              const date = parseYYYYMMDD(day);
              return (
                <Pressable
                  key={day}
                  style={styles.monthCell}
                  onPress={() => onOpenDay(day)}
                  accessibilityRole="button"
                  accessibilityLabel={`${date.toLocaleDateString(undefined, {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}, ${summaryOf(events.length, 0)}`}
                >
                  <View style={[styles.monthNumber, isToday && styles.numberToday]}>
                    <Text
                      style={[
                        styles.monthNumberText,
                        !inMonth && styles.monthNumberTextOutside,
                        isToday && styles.numberTodayText,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                  </View>
                  {shown.map((tw) => {
                    const colour = tw.displayColor ?? DEFAULT_EVENT_COLOR;
                    return (
                      <View
                        key={tw._id}
                        style={[
                          styles.monthEvent,
                          {
                            backgroundColor: withAlpha(
                              colour,
                              tw.budgetType === "BUDGETED" ? "26" : "4D",
                            ),
                            borderLeftColor: colour,
                          },
                          !inMonth && styles.monthEventOutside,
                        ]}
                      >
                        <Text style={styles.monthEventText} numberOfLines={1}>
                          {titleOf(tw)}
                        </Text>
                      </View>
                    );
                  })}
                  {hidden > 0 && (
                    <Text style={styles.monthMore} numberOfLines={1}>
                      +{hidden}
                      {maxLines > 0 ? " more" : ""}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ───────────────────────────── styles ───────────────────────────── */

const pointer = Platform.select({
  web: { cursor: "pointer" } as any,
  default: {},
});

const styles = StyleSheet.create({
  fill: { flex: 1 },

  switchWrap: {
    flexDirection: "row",
    alignSelf: "stretch",
    maxWidth: 360,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  switchItem: {
    flex: 1,
    height: 34,
    borderRadius: Radius.md - 2,
    alignItems: "center",
    justifyContent: "center",
    ...pointer,
  },
  switchItemActive: { backgroundColor: Colors.surfaceContainerLow },
  switchLabel: { fontSize: FontSize.body, color: Colors.textSecondary },
  switchLabelActive: { color: Colors.text, fontWeight: "600" },

  nav: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 2,
  },
  navHeading: { flex: 1, minWidth: 0, gap: 2 },
  navTitle: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Colors.text,
  },
  navSubtitle: { fontSize: FontSize.caption, color: Colors.textTertiary },
  navButton: { padding: 10, borderRadius: Radius.pill, ...pointer },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    ...pointer,
  },
  todayButtonText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
  },

  textToday: { color: Colors.primary },
  numberToday: { backgroundColor: Colors.primary },
  numberTodayText: { color: Colors.onPrimary, fontWeight: "700" },

  weekHeader: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  weekHeaderDay: { flex: 1, alignItems: "center", gap: 2, ...pointer },
  weekLetter: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  weekNumber: {
    width: 28,
    height: 28,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  weekNumberText: { fontSize: FontSize.body, color: Colors.text },
  weekScrollContent: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 80,
  },
  weekSurface: { flexDirection: "row" },
  weekHourLabelRow: { height: WEEK_HOUR_HEIGHT },
  weekHourLabel: {
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
    // Centre the label on its hour line.
    marginTop: -6,
  },
  weekColumn: {
    flex: 1,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: Colors.outlineVariant,
  },
  weekHourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.outlineVariant,
  },
  weekEvent: {
    position: "absolute",
    borderLeftWidth: 2,
    borderRadius: Radius.sm,
    paddingHorizontal: 2,
    overflow: "hidden",
    ...pointer,
  },
  weekEventPlanned: { borderStyle: "dashed" },
  weekEventText: {
    fontSize: FontSize.micro,
    lineHeight: 13,
    color: Colors.text,
  },
  nowLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: Colors.primary,
  },

  monthLetters: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  monthLetter: {
    flex: 1,
    textAlign: "center",
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  monthGrid: { flex: 1, paddingHorizontal: 8, paddingBottom: 8 },
  monthWeek: {
    flex: 1,
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
  },
  monthCell: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 1,
    paddingTop: 2,
    overflow: "hidden",
    ...pointer,
  },
  monthNumber: {
    alignSelf: "center",
    minWidth: 22,
    height: 22,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  monthNumberText: { fontSize: FontSize.caption, color: Colors.text },
  monthNumberTextOutside: { color: Colors.textTertiary },
  monthEvent: {
    height: MONTH_EVENT_LINE - 2,
    marginBottom: 2,
    borderLeftWidth: 2,
    borderRadius: Radius.sm,
    paddingHorizontal: 2,
    justifyContent: "center",
  },
  monthEventOutside: { opacity: 0.5 },
  monthEventText: { fontSize: FontSize.micro, color: Colors.text },
  monthMore: {
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
    paddingHorizontal: 2,
  },
});
