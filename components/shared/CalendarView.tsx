import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDateLong,
  formatSecondsAsHM,
} from "../../lib/dates";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useTimer } from "../../hooks/useTimer";
import { Id } from "../../convex/_generated/dataModel";

const isWeb = Platform.OS === "web";
const DEFAULT_DROP_DURATION = 1800; // 30 min

interface CalendarViewProps {
  title?: string;
  onAddEvent?: (day: string) => void;
}

export function CalendarView({ title, onAddEvent }: CalendarViewProps) {
  const isDesktop = useIsDesktop();
  const [selectedDay, setSelectedDay] = useState(todayYYYYMMDD());
  const [dropHour, setDropHour] = useState<number | null>(null);

  const timeWindows = useQuery(api.timeWindows.search, {
    startDay: selectedDay,
    endDay: selectedDay,
  });
  const upsertTimeWindow = useMutation(api.timeWindows.upsert);
  const timerHook = useTimer();

  const timelineRef = useRef<ScrollView>(null);

  const sortedWindows = useMemo(() => {
    if (!timeWindows) return [];
    return [...timeWindows].sort((a, b) =>
      a.startTimeHHMM.localeCompare(b.startTimeHHMM)
    );
  }, [timeWindows]);

  const totalDuration = useMemo(() => {
    if (!timeWindows) return 0;
    return timeWindows
      .filter((w) => w.budgetType === "ACTUAL")
      .reduce((sum, w) => sum + w.durationSeconds, 0);
  }, [timeWindows]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  const handleTaskDrop = useCallback(
    async (taskId: string, hour: number) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime = `${String(hour).padStart(2, "0")}:00`;

      await upsertTimeWindow({
        startTimeHHMM: startTime,
        startDayYYYYMMDD: selectedDay,
        durationSeconds: DEFAULT_DROP_DURATION,
        budgetType: "ACTUAL",
        activityType: "TASK",
        taskId: taskId as Id<"tasks">,
        timeZone: tz,
        source: "calendar",
      });

      setDropHour(null);
    },
    [selectedDay, upsertTimeWindow]
  );

  // Attach drop zone event listeners (web only)
  useEffect(() => {
    if (!isWeb || !timelineRef.current) return;
    const el = timelineRef.current as unknown as HTMLElement;
    if (!el || !el.addEventListener) return;

    const onDragOver = (e: DragEvent) => {
      const hourEl = (e.target as HTMLElement).closest?.(
        "[data-calendar-hour]"
      ) as HTMLElement | null;
      if (!hourEl) return;

      const hasTask =
        e.dataTransfer?.types.includes("application/x-task") ||
        e.dataTransfer?.types.includes("text/plain");
      if (!hasTask) return;

      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
      setDropHour(parseInt(hourEl.dataset.calendarHour!, 10));
    };

    const onDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !el.contains(related)) {
        setDropHour(null);
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const hourEl = (e.target as HTMLElement).closest?.(
        "[data-calendar-hour]"
      ) as HTMLElement | null;
      if (!hourEl) return;

      const hour = parseInt(hourEl.dataset.calendarHour!, 10);
      let taskId: string | null = null;

      const taskData = e.dataTransfer?.getData("application/x-task");
      if (taskData) {
        try {
          const parsed = JSON.parse(taskData);
          taskId = parsed.taskId;
        } catch {
          // ignore
        }
      }
      if (!taskId) {
        taskId = e.dataTransfer?.getData("text/plain") ?? null;
      }

      if (taskId) {
        handleTaskDrop(taskId, hour);
      }
      setDropHour(null);
    };

    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDrop);

    return () => {
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDrop);
    };
  }, [handleTaskDrop]);

  const setHourAttrs = useCallback((node: any, hour: number) => {
    if (!isWeb || !node) return;
    const el = node as HTMLElement;
    el.dataset.calendarHour = String(hour);
  }, []);

  // Synthesize a live timer block if timer is running
  const liveTimerWindow = useMemo(() => {
    if (!timerHook.isRunning) return null;
    const now = new Date();
    const timerDay = todayYYYYMMDD();
    if (timerDay !== selectedDay) return null;

    const startSec =
      timerHook.elapsed > 0 ? Date.now() / 1000 - timerHook.elapsed : Date.now() / 1000;
    const startDate = new Date(startSec * 1000);
    const hh = String(startDate.getHours()).padStart(2, "0");
    const mm = String(startDate.getMinutes()).padStart(2, "0");

    return {
      _id: "__live_timer__",
      startTimeHHMM: `${hh}:${mm}`,
      durationSeconds: timerHook.elapsed,
      activityType: timerHook.taskId ? "TASK" : "TRACKABLE",
      budgetType: "ACTUAL",
      title: "Timer running...",
      isLive: true,
    };
  }, [timerHook.isRunning, timerHook.elapsed, timerHook.taskId, selectedDay]);

  const allWindows = useMemo(() => {
    const base = [...sortedWindows];
    if (liveTimerWindow) {
      base.push(liveTimerWindow as any);
      base.sort((a: any, b: any) =>
        a.startTimeHHMM.localeCompare(b.startTimeHHMM)
      );
    }
    return base;
  }, [sortedWindows, liveTimerWindow]);

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {isDesktop && onAddEvent && (
            <TouchableOpacity onPress={() => onAddEvent(selectedDay)}>
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      <View style={styles.dayNav}>
        <TouchableOpacity
          onPress={() => setSelectedDay((d) => addDays(d, -1))}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDay(todayYYYYMMDD())}>
          <Text style={styles.dayLabel}>
            {formatDisplayDateLong(selectedDay)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSelectedDay((d) => addDays(d, 1))}
        >
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {sortedWindows.length} events | {formatSecondsAsHM(totalDuration)}{" "}
          tracked
        </Text>
      </View>

      <ScrollView
        ref={timelineRef}
        style={styles.timeline}
        contentContainerStyle={styles.timelineContent}
      >
        {hours.map((hour) => {
          const hourStr = String(hour).padStart(2, "0");
          const hourWindows = allWindows.filter((w: any) =>
            w.startTimeHHMM.startsWith(hourStr)
          );
          const isDropTarget = dropHour === hour;

          return (
            <View
              key={hour}
              style={[styles.hourRow, isDropTarget && styles.hourRowDropTarget]}
              ref={(node: any) => setHourAttrs(node, hour)}
            >
              <Text style={styles.hourLabel}>
                {hour === 0
                  ? "12 AM"
                  : hour < 12
                    ? `${hour} AM`
                    : hour === 12
                      ? "12 PM"
                      : `${hour - 12} PM`}
              </Text>
              <View style={styles.hourContent}>
                <View style={styles.hourLine} />
                {isDropTarget && (
                  <View style={styles.dropPreview}>
                    <Ionicons
                      name="add-circle"
                      size={14}
                      color={Colors.primary}
                    />
                    <Text style={styles.dropPreviewText}>
                      Drop to create 30min block
                    </Text>
                  </View>
                )}
                {hourWindows.map((tw: any) => (
                  <Card
                    key={tw._id}
                    style={{
                      ...styles.eventCard,
                      ...getEventColor(tw.activityType),
                      ...(tw.isLive
                        ? {
                            borderColor: Colors.success,
                            borderWidth: 1,
                          }
                        : {}),
                    }}
                  >
                    <Text style={styles.eventTime}>
                      {tw.startTimeHHMM} (
                      {formatSecondsAsHM(tw.durationSeconds)})
                    </Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {tw.title ?? tw.activityType}
                    </Text>
                    {tw.budgetType === "BUDGETED" && (
                      <Text style={styles.budgetBadge}>Budgeted</Text>
                    )}
                    {tw.isLive && (
                      <Text style={styles.liveBadge}>Live</Text>
                    )}
                  </Card>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      {!isDesktop && onAddEvent && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => onAddEvent(selectedDay)}
        >
          <Ionicons name="add" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function getEventColor(activityType: string) {
  switch (activityType) {
    case "TASK":
      return { borderLeftColor: Colors.primary } as const;
    case "EVENT":
      return { borderLeftColor: Colors.secondary } as const;
    case "TRACKABLE":
      return { borderLeftColor: Colors.success } as const;
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  // Flat header / nav / summary — no per-section fill or rule. (Req 1.)
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  dayLabel: { fontSize: 16, fontWeight: "600", color: Colors.text },
  summary: {
    alignItems: "center",
    paddingBottom: 8,
    paddingTop: 4,
  },
  summaryText: { fontSize: 13, color: Colors.textSecondary },
  timeline: { flex: 1 },
  timelineContent: { paddingHorizontal: 16, paddingBottom: 80 },
  hourRow: { flexDirection: "row", minHeight: 60 },
  hourRowDropTarget: {
    backgroundColor: Colors.primary + "10",
    borderRadius: 6,
  },
  hourLabel: {
    width: 56,
    fontSize: 12,
    color: Colors.textTertiary,
    paddingTop: 2,
    textAlign: "right",
    paddingRight: 8,
  },
  hourContent: {
    flex: 1,
    borderLeftWidth: 1,
    borderLeftColor: Colors.outlineVariant,
    paddingLeft: 12,
    paddingBottom: 4,
  },
  hourLine: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginBottom: 4,
  },
  dropPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    borderRadius: 6,
    marginBottom: 4,
  },
  dropPreviewText: { fontSize: 12, color: Colors.primary },
  eventCard: {
    marginBottom: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  eventTime: { fontSize: 12, color: Colors.textSecondary },
  eventTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: Colors.text,
    marginTop: 2,
  },
  budgetBadge: {
    fontSize: 10,
    color: Colors.warning,
    fontWeight: "600",
    marginTop: 2,
  },
  liveBadge: {
    fontSize: 10,
    color: Colors.success,
    fontWeight: "700",
    marginTop: 2,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
  },
});
