import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import {
  useDndMonitor,
  useDroppable,
  DragMoveEvent,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
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

const DEFAULT_DROP_DURATION = 1800; // 30 min — matches productivity-one fallback
const SNAP_MINUTES = 5; // matches productivity-one's `snapDuration: '00:05:00'`
const MIN_DURATION_SECONDS = 60; // matches productivity-one floor
const HOUR_DROPPABLE_PREFIX = "cal-hour-";

interface DropPreview {
  hour: number;
  minute: number;
  durationMinutes: number;
  /** Colour derived in DesktopTaskList (trackable → list → default grey). */
  color: string;
  taskName: string;
}

interface ActiveTaskDrag {
  taskId: string;
  durationSec: number;
  color: string;
  taskName: string;
}

function snapMinute(rawMinute: number): number {
  const clamped = Math.max(0, Math.min(59, rawMinute));
  const snapped = Math.round(clamped / SNAP_MINUTES) * SNAP_MINUTES;
  // Re-clamp because `Math.round(57/5)*5 = 55`, `Math.round(59/5)*5 = 60` etc.
  return Math.min(55, Math.max(0, snapped));
}

function formatClockTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, "0");
  return `${displayHour}:${mm} ${period}`;
}

/** Add minutes to a wall-clock and return the resulting hour/minute pair. */
function addMinutes(
  hour: number,
  minute: number,
  delta: number
): { hour: number; minute: number } {
  const total = hour * 60 + minute + delta;
  const wrapped = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
  return { hour: Math.floor(wrapped / 60), minute: wrapped % 60 };
}

/** Lighten/darken a hex colour for the soft preview fill (≈14% alpha). */
function withAlpha(hex: string, alphaHex: string): string {
  // Accepts #RRGGBB; falls back to passed-through if parsing fails.
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return `${hex}${alphaHex}`;
}

interface CalendarViewProps {
  title?: string;
  onAddEvent?: (day: string) => void;
}

/* ─────────────────────────────  Hour Slot  ──────────────────────────────
 * A single hour row. Registers itself as a `useDroppable` so dnd-kit's
 * collision detection can route the cursor to it, and exposes its DOM
 * node to the parent so the parent's `useDndMonitor` can compute the
 * snapped minute from `getBoundingClientRect()` + the live pointer Y.
 */
interface HourSlotProps {
  hour: number;
  registerEl: (hour: number, node: HTMLElement | null) => void;
  showPreview: boolean;
  dropPreview: DropPreview | null;
  hourWindows: any[];
}

function HourSlot({
  hour,
  registerEl,
  showPreview,
  dropPreview,
  hourWindows,
}: HourSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${HOUR_DROPPABLE_PREFIX}${hour}`,
  });

  const setRefs = useCallback(
    (node: any) => {
      // dnd-kit needs the DOM node for rect measurement; we also keep our
      // own reference so the parent monitor can recompute on each frame.
      setNodeRef(node ?? null);
      registerEl(hour, (node as HTMLElement) ?? null);
    },
    [setNodeRef, registerEl, hour]
  );

  const previewEnd =
    dropPreview &&
    addMinutes(dropPreview.hour, dropPreview.minute, dropPreview.durationMinutes);

  return (
    <View
      style={[
        styles.hourRow,
        (showPreview || isOver) && styles.hourRowDropTarget,
      ]}
      ref={setRefs as any}
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
        {showPreview && dropPreview && previewEnd && (
          // Absolute-positioned ghost block at the snapped slot. Pointer
          // events disabled so dnd-kit collision detection keeps targeting
          // the underlying hour cell, not the ghost itself.
          <View
            pointerEvents="none"
            style={[
              styles.dropGhost,
              {
                top: dropPreview.minute,
                height: Math.max(20, dropPreview.durationMinutes),
                backgroundColor: withAlpha(dropPreview.color, "22"),
                borderColor: dropPreview.color,
              },
            ]}
          >
            <Text
              style={[styles.dropGhostText, { color: dropPreview.color }]}
              numberOfLines={1}
            >
              {formatClockTime(dropPreview.hour, dropPreview.minute)}
              {"  –  "}
              {formatClockTime(previewEnd.hour, previewEnd.minute)}
              {"  "}
              <Text
                style={[styles.dropGhostDuration, { color: dropPreview.color }]}
              >
                ({dropPreview.durationMinutes} min)
              </Text>
            </Text>
            {dropPreview.taskName && (
              <Text
                style={[styles.dropGhostTitle, { color: dropPreview.color }]}
                numberOfLines={1}
              >
                {dropPreview.taskName}
              </Text>
            )}
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
              {tw.startTimeHHMM} ({formatSecondsAsHM(tw.durationSeconds)})
            </Text>
            <Text style={styles.eventTitle} numberOfLines={1}>
              {tw.title ?? tw.activityType}
            </Text>
            {tw.budgetType === "BUDGETED" && (
              <Text style={styles.budgetBadge}>Budgeted</Text>
            )}
            {tw.isLive && <Text style={styles.liveBadge}>Live</Text>}
          </Card>
        ))}
      </View>
    </View>
  );
}

export function CalendarView({ title, onAddEvent }: CalendarViewProps) {
  const isDesktop = useIsDesktop();
  const [selectedDay, setSelectedDay] = useState(todayYYYYMMDD());
  // Live preview state populated on `dragover`. We deliberately keep this in
  // a single component-local state so dragging only re-renders CalendarView,
  // not the task list.
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);

  const timeWindows = useQuery(api.timeWindows.search, {
    startDay: selectedDay,
    endDay: selectedDay,
  });
  const upsertTimeWindow = useMutation(api.timeWindows.upsert);
  const timerHook = useTimer();

  /** DOM nodes for hour cells, keyed by hour. Captured by HourSlot via
   *  the `registerHourEl` callback so we can compute pointer-relative
   *  minute precision in the drag monitor below. */
  const hourElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const registerHourEl = useCallback(
    (hour: number, node: HTMLElement | null) => {
      if (node) hourElsRef.current.set(hour, node);
      else hourElsRef.current.delete(hour);
    },
    []
  );

  /** Active task being dragged (set on dragstart, cleared on dragend/cancel). */
  const activeTaskRef = useRef<ActiveTaskDrag | null>(null);

  /**
   * Live pointer Y in viewport coords. Updated by a `window.pointermove`
   * listener attached for the lifetime of the drag. Using dnd-kit's
   * `event.delta.y + activatorEvent.clientY` gave ~1 hour snapping in
   * practice because `delta.y` is measured post-activation-threshold and
   * the derived Y drifted from the true pointer position; the result was
   * that `relY` stayed near 0 for most of the hour cell and `snapMinute`
   * kept returning `:00`. Reading `clientY` from a plain pointermove is
   * authoritative and keeps the same coord space as `getBoundingClientRect`.
   */
  const pointerYRef = useRef<number>(0);
  const pointerMoveListenerRef = useRef<
    ((e: PointerEvent) => void) | null
  >(null);

  const attachPointerTracker = useCallback((initialY: number) => {
    if (typeof window === "undefined") return;
    pointerYRef.current = initialY;
    if (pointerMoveListenerRef.current) {
      window.removeEventListener(
        "pointermove",
        pointerMoveListenerRef.current
      );
    }
    const onMove = (e: PointerEvent) => {
      pointerYRef.current = e.clientY;
    };
    pointerMoveListenerRef.current = onMove;
    window.addEventListener("pointermove", onMove, { passive: true });
  }, []);

  const detachPointerTracker = useCallback(() => {
    if (typeof window === "undefined") return;
    if (pointerMoveListenerRef.current) {
      window.removeEventListener(
        "pointermove",
        pointerMoveListenerRef.current
      );
      pointerMoveListenerRef.current = null;
    }
  }, []);

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

  /**
   * Persist a dropped task as a new TimeWindow. Always optimistic via Convex
   * (the calendar `useQuery` re-renders the moment the mutation resolves).
   * Each drop creates a NEW window — same task can be scheduled multiple
   * times, matching productivity-one (each drop is a fresh `crypto.randomUUID()`).
   */
  const handleTaskDrop = useCallback(
    (
      taskId: string,
      hour: number,
      minute: number,
      durationSec: number,
      taskName: string
    ) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const startTime = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;

      // Persist `title` so the card shows the task name the moment the
      // mutation commits, before the enriched `timeWindows.search` reply
      // round-trips. The server-side enrichment (see `timeWindows.search`)
      // also joins `task.name` on read, so we don't depend on this field
      // staying in sync — it's just a display fallback for brand-new rows
      // and for migration rows that pre-date the enrichment.
      void upsertTimeWindow({
        startTimeHHMM: startTime,
        startDayYYYYMMDD: selectedDay,
        durationSeconds: Math.max(MIN_DURATION_SECONDS, durationSec),
        budgetType: "ACTUAL",
        activityType: "TASK",
        taskId: taskId as Id<"tasks">,
        title: taskName,
        timeZone: tz,
        source: "calendar",
      });

      setDropPreview(null);
    },
    [selectedDay, upsertTimeWindow]
  );

  /* ─── dnd-kit drop integration ────────────────────────────────────────
   * Each hour cell is a `useDroppable` (id `cal-hour-${hour}`). dnd-kit's
   * collision detection in HomeDndProvider routes the cursor to the right
   * one. We hook into the lifted DndContext via `useDndMonitor` to:
   *   - capture the dragged task's color/duration on drag start
   *   - compute the snapped minute from pointer Y relative to the hour
   *     cell's getBoundingClientRect (recomputed every frame so timeline
   *     scrolling doesn't drift)
   *   - persist the time window on drop (calendar-only; the task list
   *     bows out for `cal-hour-*` over-ids — see DesktopTaskList).
   */
  const computePreview = useCallback(
    (
      hour: number,
      pointerY: number,
      active: ActiveTaskDrag
    ): DropPreview | null => {
      const el = hourElsRef.current.get(hour);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const relY = pointerY - rect.top;
      const rawMinute = Math.floor((relY / Math.max(1, rect.height)) * 60);
      const minute = snapMinute(rawMinute);
      return {
        hour,
        minute,
        durationMinutes: Math.max(
          MIN_DURATION_SECONDS / 60,
          Math.round(active.durationSec / 60)
        ),
        color: active.color,
        taskName: active.taskName,
      };
    },
    []
  );

  const onDndDragStart = useCallback(
    (event: DragStartEvent) => {
      const data = event.active.data.current as
        | {
            type?: string;
            task?: { _id: string; name: string };
            displayColor?: string;
            durationSec?: number;
          }
        | undefined;
      if (data?.type !== "task" || !data.task) return;

      activeTaskRef.current = {
        taskId: String(data.task._id),
        durationSec: data.durationSec ?? DEFAULT_DROP_DURATION,
        color: data.displayColor ?? Colors.primary,
        taskName: data.task.name,
      };

      // Seed the tracker with the pointerdown position so the very first
      // onDragMove has a valid reading, then let the window listener take
      // over. `activatorEvent` is set to the native pointerdown event by
      // PointerSensor (see @dnd-kit/core DndContext.useSensor).
      const actEvt = event.activatorEvent as { clientY?: number } | undefined;
      attachPointerTracker(
        typeof actEvt?.clientY === "number" ? actEvt.clientY : 0
      );
    },
    [attachPointerTracker]
  );

  const onDndDragMove = useCallback(
    (event: DragMoveEvent) => {
      const active = activeTaskRef.current;
      if (!active) return;
      const overId = event.over?.id ? String(event.over.id) : "";
      if (!overId.startsWith(HOUR_DROPPABLE_PREFIX)) {
        if (dropPreview !== null) setDropPreview(null);
        return;
      }
      const hour = parseInt(overId.slice(HOUR_DROPPABLE_PREFIX.length), 10);
      if (Number.isNaN(hour)) return;
      const next = computePreview(hour, pointerYRef.current, active);
      if (!next) return;
      // Only re-render if the snapped slot actually changed → ~12 renders
      // per hour traversed instead of one per pixel.
      setDropPreview((prev) =>
        prev &&
        prev.hour === next.hour &&
        prev.minute === next.minute &&
        prev.durationMinutes === next.durationMinutes &&
        prev.color === next.color
          ? prev
          : next
      );
    },
    [computePreview, dropPreview]
  );

  const onDndDragEnd = useCallback(
    (event: DragEndEvent) => {
      const active = activeTaskRef.current;
      activeTaskRef.current = null;

      const overId = event.over?.id ? String(event.over.id) : "";
      if (!active || !overId.startsWith(HOUR_DROPPABLE_PREFIX)) {
        detachPointerTracker();
        setDropPreview(null);
        return;
      }
      const hour = parseInt(overId.slice(HOUR_DROPPABLE_PREFIX.length), 10);
      if (Number.isNaN(hour)) {
        detachPointerTracker();
        setDropPreview(null);
        return;
      }
      // Recompute from the final pointer position rather than trusting
      // `dropPreview` state (which can lag the last frame).
      const final = computePreview(hour, pointerYRef.current, active);
      detachPointerTracker();
      if (!final) {
        setDropPreview(null);
        return;
      }
      handleTaskDrop(
        active.taskId,
        final.hour,
        final.minute,
        active.durationSec,
        active.taskName
      );
    },
    [computePreview, handleTaskDrop, detachPointerTracker]
  );

  const onDndDragCancel = useCallback(() => {
    activeTaskRef.current = null;
    detachPointerTracker();
    setDropPreview(null);
  }, [detachPointerTracker]);

  useDndMonitor({
    onDragStart: onDndDragStart,
    onDragMove: onDndDragMove,
    onDragEnd: onDndDragEnd,
    onDragCancel: onDndDragCancel,
  });

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
        style={styles.timeline}
        contentContainerStyle={styles.timelineContent}
      >
        {hours.map((hour) => {
          const hourStr = String(hour).padStart(2, "0");
          const hourWindows = allWindows.filter((w: any) =>
            w.startTimeHHMM.startsWith(hourStr)
          );
          const showPreview = dropPreview?.hour === hour;
          return (
            <HourSlot
              key={hour}
              hour={hour}
              registerEl={registerHourEl}
              showPreview={showPreview}
              dropPreview={showPreview ? dropPreview : null}
              hourWindows={hourWindows}
            />
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
    position: "relative",
  },
  hourLine: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginBottom: 4,
  },
  dropGhost: {
    position: "absolute",
    left: 12,
    right: 4,
    backgroundColor: Colors.primary + "22",
    borderWidth: 1,
    borderColor: Colors.primary,
    borderStyle: "dashed",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: "center",
    zIndex: 5,
  },
  dropGhostText: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: "600",
  },
  dropGhostDuration: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: "400",
  },
  dropGhostTitle: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: "500",
    marginTop: 2,
  },
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
