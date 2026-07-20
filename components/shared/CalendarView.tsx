import {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import {
  DragMoveEvent,
  DragEndEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { SectionHeadingAddButton } from "../ui/SectionHeadingAddButton";
import { Ionicons } from "@expo/vector-icons";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDateLong,
  formatSecondsAsHM,
} from "../../lib/dates";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useAuth } from "../../hooks/useAuth";
import { useTimer, useTimerElapsed } from "../../hooks/useTimer";
import { Id } from "../../convex/_generated/dataModel";
import { DEFAULT_EVENT_COLOR } from "../../lib/eventColors";
import { wallClockInTimeZone, wallClockGridToEpochMs } from "../../lib/wallClockTimeZone";
import { traceTimer } from "../../lib/timerTimeTrace";
import { AutoDismissToast } from "../ui/AutoDismissToast";
import { applyRemoveTimeWindowOptimisticUpdate } from "../../lib/removeTimeWindowOptimisticUpdate";
import { applyUpsertTimeWindowOptimisticUpdate } from "../../lib/upsertTimeWindowOptimisticUpdate";
import { CalendarEventBlock } from "./CalendarEventBlock";
import { CalendarDndMonitor, HourSlot } from "./CalendarGridPieces";
import { CalendarContextMenu } from "./CalendarContextMenu";
import {
  ActiveTaskDrag,
  DAY_HEIGHT,
  DAY_MINUTES,
  DEFAULT_CREATE_DURATION_MINUTES,
  DEFAULT_DROP_DURATION,
  DropPreview,
  HOUR_DROPPABLE_PREFIX,
  LIVE_TIMER_EVENT_ID,
  MIN_DURATION_MINUTES,
  MIN_DURATION_SECONDS,
  PX_PER_MINUTE,
  SCROLL_PADDING_ABOVE_NOW_PX,
  SNAP_MINUTES,
  TimeWindowDoc,
  CREATE_DRAG_THRESHOLD_PX,
  clamp,
  eventBlockHeightPx,
  eventGridStartMinutes,
  findVerticalScrollHost,
  formatClockTime,
  hhmmToMinutes,
  isWeb,
  minutesToHHMM,
  packOverlappingEvents,
  snapMinutes,
  undoUpsertPayloadFromCalendarRow,
  withAlpha,
} from "./CalendarViewShared";
import { calendarViewStyles as styles } from "./CalendarViewStyles";

/**
 * Optional pre-fill values for `onAddEvent`. When the host opens the
 * event-creation panel in response to a click-and-drag gesture on the
 * calendar, these carry the snapped start time and the dragged duration
 * so the panel can hydrate its fields without the user retyping them.
 */
export interface AddEventPrefill {
  startTimeHHMM: string;
  durationMinutes: number;
}

/**
 * Payload passed to `onEditEvent` when the user clicks an existing
 * event. Hosts hand this straight into `EventDialog`'s `existingEvent`
 * prop to put the dialog in edit mode.
 */
export interface EditEventPayload {
  _id: string;
  /** Persisted explicit title (undefined → derived from linked entity). */
  title?: string;
  /**
   * Server-derived name from the linked list / trackable / task. The
   * dialog uses this to:
   *   - Show as the placeholder when the explicit title is empty.
   *   - Detect when the user typed something identical to the derived
   *     name → save as `title: undefined` so the row stays dynamic.
   */
  derivedTitle?: string;
  startTimeHHMM: string;
  startDayYYYYMMDD: string;
  durationSeconds: number;
  activityType: string;
  budgetType: string;
  comments?: string;
  trackableId?: string | null;
  listId?: string | null;
  taskId?: string | null;
  recurringEventId?: string | null;
  isRecurringInstance?: boolean;
}

interface CalendarViewProps {
  title?: string;
  onAddEvent?: (day: string, prefill?: AddEventPrefill) => void;
  /**
   * Notify the host that the user clicked an event and wants to edit
   * it. Hosts should open the existing event-creation panel with this
   * payload as `existingEvent` to put the dialog in edit mode.
   */
  onEditEvent?: (event: EditEventPayload) => void;
  /**
   * Fires whenever the visible calendar day changes (prev/next, Today,
   * or initial mount). Home uses this to align the task panel’s query
   * window with the same day as productivity-one.
   */
  onSelectedDayChange?: (dayYYYYMMDD: string) => void;
}

/* ────────────────────────────────────────────────────────────────────────
 *  CalendarView
 * ──────────────────────────────────────────────────────────────────────── */
export function CalendarView({
  title,
  onAddEvent,
  onEditEvent,
  onSelectedDayChange,
}: CalendarViewProps) {
  const isDesktop = useIsDesktop();
  const { profileReady } = useAuth();
  const timerHook = useTimer();
  const gridTimeZone = useMemo(() => {
    if (timerHook.isRunning && timerHook.canonicalTimeZone) {
      return timerHook.canonicalTimeZone;
    }
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }, [timerHook.isRunning, timerHook.canonicalTimeZone]);
  const [selectedDay, setSelectedDay] = useState(todayYYYYMMDD());

  /**
   * Native-only "edit mode": on iOS/Android, long-pressing an event
   * selects it and reveals visible drag handles at the top and bottom
   * of the tile. Only one event can be selected at a time. Web relies
   * on the pointer-based edge-hit strips and doesn't need this state.
   */
  // `_id` on `TimeWindowDoc` is a plain `string` (not the branded
  // `Id<"timeWindows">`), so the selection state matches that. This
  // avoids gratuitous casts at the call site.
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const handleSelectEvent = useCallback(
    (id: string) => setSelectedEventId(id),
    [],
  );
  const handleDeselectEvent = useCallback(() => setSelectedEventId(null), []);
  // Auto-deselect when the day changes — the previously-selected event
  // isn't on screen any more.
  useEffect(() => {
    setSelectedEventId(null);
  }, [selectedDay]);

  useEffect(() => {
    onSelectedDayChange?.(selectedDay);
  }, [selectedDay, onSelectedDayChange]);
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);
  /**
   * Live state for the click-and-drag-to-create gesture on empty calendar
   * space. `null` while no creation gesture is active. While the user is
   * dragging we update {start, end} on every pointermove so the preview
   * block tracks the cursor in realtime. We normalise so `start <= end`
   * regardless of drag direction (matches the spec's "Drag Direction").
   */
  const [creationDraft, setCreationDraft] = useState<
    | { startMinutes: number; endMinutes: number }
    | null
  >(null);
  /** Ref to the grid column DOM node — used to map clientY → minute. */
  const gridColumnRef = useRef<HTMLElement | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const [nowPulse, setNowPulse] = useState(0);

  /** Move the red “now” line as real time progresses. */
  useEffect(() => {
    const id = setInterval(() => setNowPulse((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  /** Web-only keyframes for the live timer’s pulsing green outline (see `eventBlockLive`). */
  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const id = "cal-live-timer-outline-pulse-v1";
    if (document.getElementById(id)) return;
    const c = Colors.success;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      @keyframes calLiveTimerOutlinePulse {
        0%, 100% {
          outline-color: ${c}99;
          box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 0 4px ${c}40;
        }
        50% {
          outline-color: ${c};
          box-shadow: 0 1px 2px rgba(0,0,0,0.08), 0 0 12px ${c}80;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.getElementById(id)?.remove();
    };
  }, []);

  /**
   * When today is visible, snap the viewport to roughly the current time on every
   * transition to viewing this `selectedDay` (including refresh: remount resets state).
   */
  useLayoutEffect(() => {
    const todayInGrid = wallClockInTimeZone(Date.now(), gridTimeZone)
      .startDayYYYYMMDD;
    if (selectedDay !== todayInGrid) return;

    const wall = wallClockInTimeZone(Date.now(), gridTimeZone);
    const minutes = hhmmToMinutes(wall.startTimeHHMM);
    const y = Math.max(
      0,
      minutes * PX_PER_MINUTE - SCROLL_PADDING_ABOVE_NOW_PX
    );

    const run = () => {
      scrollViewRef.current?.scrollTo({ y, animated: false });
    };

    run();
    requestAnimationFrame(() => requestAnimationFrame(run));
    const tMid = setTimeout(run, 100);
    const tLate = setTimeout(run, 400);

    return () => {
      clearTimeout(tMid);
      clearTimeout(tLate);
    };
  }, [selectedDay, gridTimeZone]);

  const todayInGridZone = useMemo(() => {
    void nowPulse;
    return wallClockInTimeZone(Date.now(), gridTimeZone).startDayYYYYMMDD;
  }, [gridTimeZone, nowPulse]);

  const isTodayColumn = selectedDay === todayInGridZone;
  const currentTimeMinutesSinceMidnight = useMemo(() => {
    void nowPulse;
    const wall = wallClockInTimeZone(Date.now(), gridTimeZone);
    if (wall.startDayYYYYMMDD !== selectedDay) return null;
    return hhmmToMinutes(wall.startTimeHHMM);
  }, [nowPulse, gridTimeZone, selectedDay]);

  /**
   * Right-click context menu. A single state object means "only one menu
   * can be open at a time" is enforced for free. Position is the cursor's
   * viewport coords; the menu is rendered with `position: fixed` so it
   * floats above the (scrollable) timeline and isn't clipped.
   */
  type CalendarContextMenuState =
    | {
        kind: "event";
        x: number;
        y: number;
        eventId: Id<"timeWindows">;
      }
    | {
        kind: "empty";
        x: number;
        y: number;
        startMinutes: number;
      };
  const [contextMenu, setContextMenu] = useState<CalendarContextMenuState | null>(
    null
  );

  const undoDeletedEventSnapshotRef = useRef<TimeWindowDoc | null>(null);
  const [deletedEventToastKey, setDeletedEventToastKey] = useState(0);
  const [deletedEventToastMessage, setDeletedEventToastMessage] = useState<
    string | null
  >(null);
  const clearDeletedEventToast = useCallback(() => {
    undoDeletedEventSnapshotRef.current = null;
    setDeletedEventToastMessage(null);
  }, []);

  const [eventSaveErrorToastKey, setEventSaveErrorToastKey] = useState(0);
  const [eventSaveErrorMessage, setEventSaveErrorMessage] = useState<
    string | null
  >(null);
  const clearEventSaveErrorToast = useCallback(() => {
    setEventSaveErrorMessage(null);
  }, []);
  const reportEventSaveError = useCallback((message: string) => {
    setEventSaveErrorToastKey((k) => k + 1);
    setEventSaveErrorMessage(message);
  }, []);

  const timeWindows = useQuery(
    api.timeWindows.search,
    profileReady
      ? {
          startDay: selectedDay,
          endDay: selectedDay,
        }
      : "skip",
  );
  const recurringEventRules = useQuery(
    (api as any).recurringEvents.list,
    profileReady ? {} : "skip",
  );
  const generateRecurringEventInstances = useMutation(
    (api as any).recurringEvents.generateInstances
  );
  const upsertTimeWindow = useMutation(
    api.timeWindows.upsert,
  ).withOptimisticUpdate(applyUpsertTimeWindowOptimisticUpdate);
  const removeTimeWindow = useMutation(
    api.timeWindows.remove,
  ).withOptimisticUpdate((localStore, args) => {
    applyRemoveTimeWindowOptimisticUpdate(localStore, args.id);
  });

  const hourElsRef = useRef<Map<number, HTMLElement>>(new Map());
  const registerHourEl = useCallback(
    (hour: number, node: HTMLElement | null) => {
      if (node) hourElsRef.current.set(hour, node);
      else hourElsRef.current.delete(hour);
    },
    []
  );

  const activeTaskRef = useRef<ActiveTaskDrag | null>(null);
  const pointerYRef = useRef<number>(0);
  const pointerMoveListenerRef = useRef<((e: PointerEvent) => void) | null>(null);

  const attachPointerTracker = useCallback((initialY: number) => {
    if (typeof window === "undefined") return;
    pointerYRef.current = initialY;
    if (pointerMoveListenerRef.current) {
      window.removeEventListener("pointermove", pointerMoveListenerRef.current);
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

  const sortedWindows = useMemo<TimeWindowDoc[]>(() => {
    if (!timeWindows) return [];
    return [...(timeWindows as TimeWindowDoc[])].sort((a, b) =>
      a.startTimeHHMM.localeCompare(b.startTimeHHMM)
    );
  }, [timeWindows]);

  /** Dev trace: calendar row with canonical epoch (stage F). Deduped by id+instant. */
  const tracedCalendarRenderRef = useRef(new Set<string>());
  useEffect(() => {
    for (const w of sortedWindows) {
      if (w.startDayYYYYMMDD !== selectedDay) continue;
      if (typeof w.startTimeEpochMs !== "number" || !Number.isFinite(w.startTimeEpochMs)) {
        continue;
      }
      const sig = `${String(w._id)}:${w.startTimeEpochMs}:${w.startDayYYYYMMDD}`;
      if (tracedCalendarRenderRef.current.has(sig)) continue;
      tracedCalendarRenderRef.current.add(sig);
      const wall = wallClockInTimeZone(w.startTimeEpochMs, w.timeZone);
      traceTimer("F_calendarRender", {
        stage: "F",
        timeWindowId: w._id,
        startTimeEpochMs: w.startTimeEpochMs,
        rowTimeZoneIANA: w.timeZone,
        gridTimeZoneIANA: gridTimeZone,
        sameZoneAsGrid: w.timeZone === gridTimeZone,
        wallFromEpochInRowZone: wall,
        renderedGridStartMinutes: eventGridStartMinutes(w, gridTimeZone),
        persistedStartTimeHHMM: w.startTimeHHMM,
        source: w.source,
      });
    }
  }, [sortedWindows, selectedDay, gridTimeZone]);

  const totalDuration = useMemo(() => {
    if (!timeWindows) return 0;
    return (timeWindows as TimeWindowDoc[])
      .filter((w) => w.budgetType === "ACTUAL")
      .reduce((sum, w) => sum + w.durationSeconds, 0);
  }, [timeWindows]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  useEffect(() => {
    if (recurringEventRules === undefined) return;
    void generateRecurringEventInstances({
      rangeStartYYYYMMDD: selectedDay,
      rangeEndYYYYMMDD: selectedDay,
    });
  }, [
    selectedDay,
    recurringEventRules?.length,
    recurringEventRules?.map((r: any) => r._id).join(","),
    generateRecurringEventInstances,
  ]);

  /* ─── Task→Calendar drop (via dnd-kit) ───────────────────────────── */
  const handleTaskDrop = useCallback(
    (
      taskId: string,
      startMinutes: number,
      durationSec: number,
      // Kept in the signature to avoid changing every drag callsite,
      // but intentionally NOT persisted: dropping a task should leave
      // `title` undefined so the event tracks the task name dynamically
      // (see "Dynamic Update Behavior" — renaming the task updates the
      // calendar label automatically).
      _taskName: string
    ) => {
      const tz = gridTimeZone;
      upsertTimeWindow({
        startTimeHHMM: minutesToHHMM(startMinutes),
        startDayYYYYMMDD: selectedDay,
        durationSeconds: Math.max(MIN_DURATION_SECONDS, durationSec),
        budgetType: "ACTUAL",
        activityType: "TASK",
        taskId: taskId as Id<"tasks">,
        // No `title` → server derives it from the task name on every
        // read.
        timeZone: tz,
        source: "calendar",
      }).catch(() => {
        reportEventSaveError("Couldn't add the event — please try again.");
      });
      setDropPreview(null);
    },
    [selectedDay, upsertTimeWindow, gridTimeZone, reportEventSaveError]
  );

  /**
   * Compute the snapped start-minute-of-day from the live pointer Y, by
   * measuring the pointer's offset within the over hour cell. We use our
   * own `getBoundingClientRect()` rather than dnd-kit's `over.rect` so the
   * value stays correct even if the timeline scrolls mid-drag.
   */
  const computePreview = useCallback(
    (hour: number, pointerY: number, active: ActiveTaskDrag): DropPreview | null => {
      const el = hourElsRef.current.get(hour);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      const relY = pointerY - rect.top;
      const rawMinute = (relY / Math.max(1, rect.height)) * 60;
      const minuteInHour = clamp(snapMinutes(rawMinute), 0, 60 - SNAP_MINUTES);
      const startMinutes = clamp(
        hour * 60 + minuteInHour,
        0,
        DAY_MINUTES -
          Math.max(MIN_DURATION_MINUTES, Math.round(active.durationSec / 60))
      );
      return {
        startMinutes,
        durationMinutes: Math.max(
          MIN_DURATION_MINUTES,
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
      setDropPreview((prev) =>
        prev &&
        prev.startMinutes === next.startMinutes &&
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
      const final = computePreview(hour, pointerYRef.current, active);
      detachPointerTracker();
      if (!final) {
        setDropPreview(null);
        return;
      }
      handleTaskDrop(
        active.taskId,
        final.startMinutes,
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

  /**
   * `useDndMonitor` throws if there's no `DndContext` above. On native we
   * short-circuit `HomeDndProvider` to a passthrough (dnd-kit is DOM-only),
   * so the hook would crash. It's invoked instead from `<CalendarDndMonitor>`
   * below, which is only mounted on web — keeping rules-of-hooks clean (the
   * hook is conditionally CALLED, not conditionally listed in this function).
   */

  /* ─── In-calendar event drag/resize commit ───────────────────────── */
  /**
   * Shift the running timer's `startTime` (Convex). Epoch is computed with
   * `wallClockGridToEpochMs` in `timerHook.timeZone` — same zone as finalize.
   */
  const handleLiveTimerStartResize = useCallback(
    async (startMinutes: number) => {
      const tz = gridTimeZone;
      const epochMs = timerHook.startTime ?? Date.now();
      const wall = wallClockInTimeZone(epochMs, tz);
      if (wall.startDayYYYYMMDD !== selectedDay) return;

      const safeMin = Math.max(
        0,
        Math.min(DAY_MINUTES - 1, Math.round(startMinutes)),
      );
      let startMs: number;
      try {
        startMs = wallClockGridToEpochMs(selectedDay, safeMin, tz);
      } catch {
        return;
      }
      if (startMs > Date.now()) return;

      traceTimer("A_resizeGesture_and_B_adjustPayload", {
        stage: "A-B",
        selectedDay,
        draggedWallClockMinutes: safeMin,
        draggedWallClockHHMM: minutesToHHMM(safeMin),
        canonicalTimeZoneIANA: tz,
        sameZoneAsTimerRow: tz === timerHook.canonicalTimeZone,
        startTimeEpochMs: startMs,
        startIso: new Date(startMs).toISOString(),
        roundTripWall: wallClockInTimeZone(startMs, tz),
      });

      await timerHook.commitLiveTimerResize(startMs);
    },
    [selectedDay, timerHook, gridTimeZone]
  );

  /**
   * Persist a moved or resized event. We must spread *all* existing
   * fields because `timeWindows.upsert` does a full replacement (`patch`
   * with the supplied keys) — omitting e.g. `taskId` would null it out
   * on the server and turn the row into a generic "EVENT".
   *
   * `startMinutes` comes from the drag gesture, which is always measured
   * against the on-screen grid — i.e. it's a wall-clock minute in
   * `gridTimeZone`, not necessarily `tw.timeZone` (the row's original
   * zone, e.g. set by whoever originally created the event on a
   * different device/timezone). Pairing it with `tw.timeZone` instead of
   * `gridTimeZone` made the server interpret the dragged time in the
   * WRONG zone, silently shifting the persisted instant by the zone
   * offset — the event would then render at some other hour entirely,
   * which looked like it had vanished. Re-anchoring to `gridTimeZone` on
   * every move/resize is intentional: once you drag an event, "this
   * exact wall-clock time in my zone" becomes its new canonical instant.
   */
  const handleEventUpdate = useCallback(
    (id: string, startMinutes: number, durationMinutes: number) => {
      const tw = sortedWindows.find((w) => String(w._id) === id);
      if (!tw) return;
      return upsertTimeWindow({
        id: tw._id as Id<"timeWindows">,
        startTimeHHMM: minutesToHHMM(startMinutes),
        startDayYYYYMMDD: tw.startDayYYYYMMDD,
        durationSeconds: Math.max(
          MIN_DURATION_SECONDS,
          Math.round(durationMinutes * 60)
        ),
        budgetType: tw.budgetType,
        activityType: tw.activityType,
        taskId: tw.taskId as Id<"tasks"> | undefined,
        trackableId: tw.trackableId as Id<"trackables"> | undefined,
        listId: tw.listId as Id<"lists"> | undefined,
        title: tw.title,
        comments: tw.comments,
        tagIds: tw.tagIds as Id<"tags">[] | undefined,
        timeZone: gridTimeZone,
        source: tw.source,
      }).then(
        () => undefined,
        (err) => {
          reportEventSaveError("Couldn't save the change — please try again.");
          throw err;
        }
      );
    },
    [sortedWindows, upsertTimeWindow, reportEventSaveError, gridTimeZone]
  );

  /**
   * Delete a time window. Optimistic cache update + undo toast (`AutoDismissToast`).
   */
  const handleEventDelete = useCallback(
    (id: string) => {
      const tw = sortedWindows.find((w) => String(w._id) === String(id));
      if (!tw || tw.isLive) return;
      undoDeletedEventSnapshotRef.current = tw;
      setDeletedEventToastKey((k) => k + 1);
      setDeletedEventToastMessage("Event deleted");
      removeTimeWindow({ id: id as Id<"timeWindows"> }).catch(() => {
        clearDeletedEventToast();
      });
    },
    [sortedWindows, removeTimeWindow, clearDeletedEventToast],
  );

  const restoreDeletedCalendarEvent = useCallback(() => {
    const snapshot = undoDeletedEventSnapshotRef.current;
    if (!snapshot || snapshot.isLive) return;
    void upsertTimeWindow(undoUpsertPayloadFromCalendarRow(snapshot));
  }, [upsertTimeWindow]);

  /* ─── Right-click context menu ───────────────────────────────────── */
  /**
   * Single document-level `contextmenu` listener. We hit-test the event
   * target with `closest()` against:
   *   - `[data-calendar-event-id]` → existing event → "Delete" menu
   *   - `[data-calendar-grid='1']` → empty calendar space → "Create"
   *
   * This bypasses RN-Web's per-element prop forwarding entirely, which
   * is important because `onContextMenu` on `<View>` was not firing on
   * macOS two-finger taps in this version of RN-Web.
   *
   * Because we always call `preventDefault()` before opening the menu,
   * the native browser context menu never appears.
   */
  useEffect(() => {
    if (typeof document === "undefined") return;
    const onCtx = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      const eventNode = target.closest?.(
        "[data-calendar-event-id]"
      ) as HTMLElement | null;
      if (eventNode) {
        const id = eventNode.getAttribute("data-calendar-event-id");
        if (!id) return;
        e.preventDefault();
        // eslint-disable-next-line no-console
        console.log("RIGHT CLICK DETECTED (event)", {
          x: e.clientX,
          y: e.clientY,
          eventId: id,
        });
        setContextMenu({
          kind: "event",
          x: e.clientX,
          y: e.clientY,
          eventId: id as Id<"timeWindows">,
        });
        return;
      }

      const gridNode = target.closest?.(
        "[data-calendar-grid='1']"
      ) as HTMLElement | null;
      if (gridNode) {
        e.preventDefault();
        const grid = gridColumnRef.current;
        const rect = grid?.getBoundingClientRect();
        const startMinutes = rect
          ? clamp(
              snapMinutes((e.clientY - rect.top) / PX_PER_MINUTE),
              0,
              DAY_MINUTES - MIN_DURATION_MINUTES
            )
          : 0;
        // eslint-disable-next-line no-console
        console.log("RIGHT CLICK DETECTED (empty)", {
          x: e.clientX,
          y: e.clientY,
          startMinutes,
        });
        setContextMenu({
          kind: "empty",
          x: e.clientX,
          y: e.clientY,
          startMinutes,
        });
      }
    };
    document.addEventListener("contextmenu", onCtx);
    return () => document.removeEventListener("contextmenu", onCtx);
  }, []);

  /** Dismissal: outside-click and Escape. */
  useEffect(() => {
    if (!contextMenu || typeof window === "undefined") return;
    const onDocPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.("[data-calendar-context-menu='1']")) return;
      setContextMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("pointerdown", onDocPointerDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDocPointerDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  /* ─── Click-and-drag to create new event (empty space) ──────────── */
  /**
   * Handle pointerdown on the empty calendar surface. Flow:
   *   1. Capture the pointer Y at mousedown → snapped start minute.
   *   2. Subscribe to window pointermove. Until the cursor has moved
   *      `CREATE_DRAG_THRESHOLD_PX` we don't show a preview (prevents
   *      every empty-slot click from spawning a draft event).
   *   3. Once activated, normalise so start = min, end = max so the
   *      gesture works in both directions (spec § 2 "Drag Direction").
   *   4. On pointerup: if not activated → no-op. Otherwise persist a new
   *      ACTUAL/EVENT row and clear the preview.
   *
   * Existing event blocks `stopPropagation()` in their pointerdown
   * (see `startInteraction` in CalendarEventBlock), so this handler
   * only fires for clicks on truly empty calendar space — leaving
   * event drag/resize and dnd-kit task drops untouched.
   */
  const handleCreatePointerDown = useCallback(
    // RN-Web forwards the raw PointerEvent on `nativeEvent`, but on plain
    // web React it comes through as a SyntheticEvent. Accept either.
    (ev: any) => {
      if (typeof window === "undefined") return;
      const native: PointerEvent | undefined =
        typeof ev?.clientY === "number" ? ev : ev?.nativeEvent;
      if (!native) return;
      // Only react to primary mouse / touch / pen, never right-click.
      if (typeof native.button === "number" && native.button !== 0) return;
      const grid = gridColumnRef.current;
      if (!grid) return;

      const rect = grid.getBoundingClientRect();
      const initialClientY = native.clientY;
      const initialOffset = initialClientY - rect.top;
      const startMinAtDown = clamp(
        snapMinutes(initialOffset / PX_PER_MINUTE),
        0,
        DAY_MINUTES
      );

      let activated = false;
      let lastClientY = initialClientY;

      const minuteFromClientY = (clientY: number): number => {
        const r = grid.getBoundingClientRect();
        const offset = clientY - r.top;
        return clamp(snapMinutes(offset / PX_PER_MINUTE), 0, DAY_MINUTES);
      };

      const scrollHost =
        findVerticalScrollHost(grid);

      const onScroll = () => {
        if (!activated) return;
        const currentMin = minuteFromClientY(lastClientY);
        const start = Math.min(startMinAtDown, currentMin);
        const end = Math.max(startMinAtDown, currentMin);
        setCreationDraft((prev) =>
          prev && prev.startMinutes === start && prev.endMinutes === end
            ? prev
            : { startMinutes: start, endMinutes: end }
        );
      };

      const onMove = (ev: PointerEvent) => {
        lastClientY = ev.clientY;
        if (!activated) {
          if (Math.abs(ev.clientY - initialClientY) < CREATE_DRAG_THRESHOLD_PX) {
            return;
          }
          activated = true;
        }
        const currentMin = minuteFromClientY(ev.clientY);
        const start = Math.min(startMinAtDown, currentMin);
        const end = Math.max(startMinAtDown, currentMin);
        setCreationDraft((prev) =>
          prev && prev.startMinutes === start && prev.endMinutes === end
            ? prev
            : { startMinutes: start, endMinutes: end }
        );
      };

      const cleanup = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        if (scrollHost) {
          scrollHost.removeEventListener("scroll", onScroll);
        }
      };

      const onUp = (ev: PointerEvent) => {
        cleanup();
        if (!activated) {
          // Pure click (no drag past threshold) — do nothing. Avoids
          // accidental panel opens on stray clicks (spec § 5).
          setCreationDraft(null);
          return;
        }
        const endMin = minuteFromClientY(ev.clientY);
        let start = Math.min(startMinAtDown, endMin);
        let end = Math.max(startMinAtDown, endMin);
        // Sub-snap-grid drags (or up/down jitter that lands on the same
        // snap line) → fall back to a sensible default duration.
        if (end - start < MIN_DURATION_MINUTES) {
          end = Math.min(DAY_MINUTES, start + DEFAULT_CREATE_DURATION_MINUTES);
          if (end === DAY_MINUTES) {
            start = Math.max(0, end - DEFAULT_CREATE_DURATION_MINUTES);
          }
        }
        setCreationDraft(null);
        // Delegate the actual creation to the host: open the event-
        // creation panel pre-filled with the dragged range. We do NOT
        // persist anything yet — the user confirms in the panel.
        if (onAddEvent) {
          onAddEvent(selectedDay, {
            startTimeHHMM: minutesToHHMM(start),
            durationMinutes: end - start,
          });
        }
      };

      const onCancel = () => {
        cleanup();
        setCreationDraft(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      scrollHost?.addEventListener("scroll", onScroll, { passive: true });
    },
    [selectedDay, onAddEvent]
  );

  /* ─── Live timer pseudo-event ─────────────────────────────────────── */
  // Minute-resolution tick: the live block's geometry is minute-grained
  // (PX_PER_MINUTE), so re-rendering the calendar every SECOND bought
  // nothing visible and cost a full-tree render per tick. One tick per
  // minute keeps the block growing in step with the grid.
  const liveElapsedMinuteRes = useTimerElapsed(
    timerHook.startTime,
    60_000,
  );
  const liveTimerWindow = useMemo<TimeWindowDoc | null>(() => {
    if (!timerHook.isRunning) return null;
    const tz = gridTimeZone;
    const epochMs = timerHook.startTime ?? Date.now();
    const wall = wallClockInTimeZone(epochMs, tz);
    if (wall.startDayYYYYMMDD !== selectedDay) return null;

    return {
      _id: LIVE_TIMER_EVENT_ID,
      startTimeHHMM: wall.startTimeHHMM,
      startDayYYYYMMDD: selectedDay,
      startTimeEpochMs: epochMs,
      durationSeconds: liveElapsedMinuteRes,
      activityType: timerHook.taskId ? "TASK" : "TRACKABLE",
      budgetType: "ACTUAL",
      timeZone: tz,
      isLive: true,
      displayTitle: timerHook.displayTitle?.trim() || undefined,
      displayColor: timerHook.displayColor ?? DEFAULT_EVENT_COLOR,
      secondaryColor: timerHook.secondaryColor,
      ...(timerHook.taskId ? { taskId: timerHook.taskId } : {}),
      ...(timerHook.trackableId ? { trackableId: timerHook.trackableId } : {}),
    };
  }, [
    timerHook.isRunning,
    timerHook.startTime,
    liveElapsedMinuteRes,
    timerHook.taskId,
    timerHook.trackableId,
    timerHook.displayTitle,
    timerHook.displayColor,
    timerHook.secondaryColor,
    timerHook.canonicalTimeZone,
    gridTimeZone,
    selectedDay,
  ]);

  const eventsToRender = useMemo<TimeWindowDoc[]>(() => {
    const base = [...sortedWindows];
    if (liveTimerWindow) base.push(liveTimerWindow);
    return base;
  }, [sortedWindows, liveTimerWindow]);

  // Pre-compute lane assignments so overlapping events render side-by-side
  // instead of stacking. Memoised on `eventsToRender` so the (cheap) O(n²)
  // packing pass only re-runs when the event set actually changes — not on
  // every drag-frame re-render.
  const eventLayouts = useMemo(
    () => packOverlappingEvents(eventsToRender, gridTimeZone),
    [eventsToRender, gridTimeZone]
  );

  const previewTop = dropPreview ? dropPreview.startMinutes * PX_PER_MINUTE : 0;
  const previewHeight = dropPreview
    ? eventBlockHeightPx(dropPreview.durationMinutes)
    : 0;
  const previewEnd = dropPreview
    ? dropPreview.startMinutes + dropPreview.durationMinutes
    : 0;
  const overHourFromPreview = dropPreview
    ? Math.floor(dropPreview.startMinutes / 60)
    : -1;

  return (
    <View style={styles.container}>
      {isWeb && (
        <CalendarDndMonitor
          onDragStart={onDndDragStart}
          onDragMove={onDndDragMove}
          onDragEnd={onDndDragEnd}
          onDragCancel={onDndDragCancel}
        />
      )}
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {isDesktop && onAddEvent && (
            <SectionHeadingAddButton
              onPress={() => onAddEvent(selectedDay)}
              accessibilityLabel="Add event"
            />
          )}
        </View>
      )}

      <View style={styles.dayNav}>
        <TouchableOpacity onPress={() => setSelectedDay((d) => addDays(d, -1))}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDay(todayYYYYMMDD())}>
          <Text style={styles.dayLabel}>
            {formatDisplayDateLong(selectedDay)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDay((d) => addDays(d, 1))}>
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
        ref={scrollViewRef}
        style={styles.timeline}
        contentContainerStyle={styles.timelineContent}
      >
        {/* The whole timeline is one absolute-positioning surface. The hour
            grid (labels + droppable backdrop) and the events layer share the
            same coordinate space so `top = minute * PX_PER_MINUTE` aligns
            exactly with the hour rows. */}
        <View style={[styles.timelineSurface, { height: DAY_HEIGHT }]}>
          {/* Left: hour labels column. */}
          <View style={styles.labelsColumn}>
            {hours.map((h) => (
              <View key={h} style={styles.hourLabelRow}>
                <Text style={styles.hourLabel}>
                  {h === 0
                    ? "12 AM"
                    : h < 12
                      ? `${h} AM`
                      : h === 12
                        ? "12 PM"
                        : `${h - 12} PM`}
                </Text>
              </View>
            ))}
          </View>

          {/* Right: hour-grid droppable backdrop + events layer. */}
          <View
            style={styles.gridColumn}
            // RN-Web forwards `ref` to the underlying <div>. We use it
            // to (a) measure clientY → minute, and (b) tag the node with
            // `data-calendar-grid="1"` so the document-level
            // `contextmenu` listener can identify empty calendar space.
            ref={(node: any) => {
              const el = isWeb ? ((node as HTMLElement | null) ?? null) : null;
              gridColumnRef.current = el;
              if (el) el.setAttribute("data-calendar-grid", "1");
            }}
            onPointerDown={handleCreatePointerDown as any}
          >
            {hours.map((h) => (
              <HourSlot
                key={h}
                hour={h}
                registerEl={registerHourEl}
                isOverPreview={overHourFromPreview === h}
              />
            ))}

            {/* Absolute events layer. `pointerEvents="box-none"` means the
                container itself doesn't intercept clicks — only its
                positioned children do — so empty calendar areas still let
                pointer events fall through to the hour cells underneath
                (preserving dnd-kit task-drop collision detection). */}
            <View
              pointerEvents="box-none"
              style={styles.eventsLayer}
            >
              {eventsToRender.map((tw) => {
                const layout = eventLayouts.get(tw._id) ?? {
                  lane: 0,
                  laneCount: 1,
                };
                if (tw.isLive) {
                  return (
                    <CalendarEventBlock
                      key={tw._id}
                      tw={tw}
                      gridTimeZone={gridTimeZone}
                      layout={layout}
                      onCommit={(id, startMinutes) => {
                        if (id === LIVE_TIMER_EVENT_ID) {
                          return handleLiveTimerStartResize(startMinutes);
                        }
                      }}
                    />
                  );
                }
                return (
                  <CalendarEventBlock
                    key={tw._id}
                    tw={tw}
                    gridTimeZone={gridTimeZone}
                    layout={layout}
                    onCommit={handleEventUpdate}
                    isSelected={selectedEventId === tw._id}
                    onSelect={handleSelectEvent}
                    onDeselect={handleDeselectEvent}
                    onEditRequest={
                      onEditEvent
                        ? () =>
                            onEditEvent({
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
                              listId: tw.listId,
                              taskId: tw.taskId,
                              recurringEventId: tw.recurringEventId,
                              isRecurringInstance: !!tw.isRecurringInstance,
                            })
                        : undefined
                    }
                  />
                );
              })}

              {creationDraft &&
                (() => {
                  const cTop = creationDraft.startMinutes * PX_PER_MINUTE;
                  const cDuration = Math.max(
                    MIN_DURATION_MINUTES,
                    creationDraft.endMinutes - creationDraft.startMinutes
                  );
                  const cHeight = eventBlockHeightPx(cDuration);
                  return (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.dropGhost,
                        {
                          top: cTop,
                          height: cHeight,
                          backgroundColor: withAlpha(
                            DEFAULT_EVENT_COLOR,
                            "22"
                          ),
                          borderColor: DEFAULT_EVENT_COLOR,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.dropGhostText,
                          { color: DEFAULT_EVENT_COLOR },
                        ]}
                        numberOfLines={1}
                      >
                        {formatClockTime(creationDraft.startMinutes)}
                        {"  –  "}
                        {formatClockTime(
                          creationDraft.startMinutes + cDuration
                        )}
                        {"  "}
                        <Text
                          style={[
                            styles.dropGhostDuration,
                            { color: DEFAULT_EVENT_COLOR },
                          ]}
                        >
                          ({cDuration} min)
                        </Text>
                      </Text>
                    </View>
                  );
                })()}

              {dropPreview && (
                <View
                  pointerEvents="none"
                  style={[
                    styles.dropGhost,
                    {
                      top: previewTop,
                      height: previewHeight,
                      backgroundColor: withAlpha(dropPreview.color, "22"),
                      borderColor: dropPreview.color,
                    },
                  ]}
                >
                  <Text
                    style={[styles.dropGhostText, { color: dropPreview.color }]}
                    numberOfLines={1}
                  >
                    {formatClockTime(dropPreview.startMinutes)}
                    {"  –  "}
                    {formatClockTime(previewEnd)}
                    {"  "}
                    <Text
                      style={[
                        styles.dropGhostDuration,
                        { color: dropPreview.color },
                      ]}
                    >
                      ({dropPreview.durationMinutes} min)
                    </Text>
                  </Text>
                  {dropPreview.taskName ? (
                    <Text
                      style={[
                        styles.dropGhostTitle,
                        { color: dropPreview.color },
                      ]}
                      numberOfLines={1}
                    >
                      {dropPreview.taskName}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
          </View>

          {isTodayColumn && currentTimeMinutesSinceMidnight != null ? (
            <View
              pointerEvents="none"
              style={[
                styles.nowLine,
                {
                  top: clamp(
                    currentTimeMinutesSinceMidnight * PX_PER_MINUTE,
                    0,
                    DAY_HEIGHT - 1
                  ),
                },
              ]}
            />
          ) : null}
        </View>
      </ScrollView>

      {!isDesktop && onAddEvent && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => onAddEvent(selectedDay)}
        >
          <Ionicons name="add" size={24} color={Colors.onPrimary} />
        </TouchableOpacity>
      )}

      {/* Single right-click context menu — content depends on whether
          the user clicked an event or empty calendar space. */}
      {contextMenu && (
        <CalendarContextMenu
          state={contextMenu}
          onDelete={() => {
            if (contextMenu.kind !== "event") return;
            handleEventDelete(contextMenu.eventId);
            setContextMenu(null);
          }}
          onEdit={() => {
            if (contextMenu.kind !== "event") return;
            const tw = sortedWindows.find((w) => w._id === contextMenu.eventId);
            setContextMenu(null);
            if (tw && onEditEvent) {
              onEditEvent({
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
                listId: tw.listId,
                taskId: tw.taskId,
                recurringEventId: tw.recurringEventId,
                isRecurringInstance: !!tw.isRecurringInstance,
              });
            }
          }}
          onCreate={() => {
            if (contextMenu.kind !== "empty") return;
            const start = contextMenu.startMinutes;
            setContextMenu(null);
            if (onAddEvent) {
              onAddEvent(selectedDay, {
                startTimeHHMM: minutesToHHMM(start),
                durationMinutes: DEFAULT_CREATE_DURATION_MINUTES,
              });
            }
          }}
        />
      )}

      <AutoDismissToast
        key={deletedEventToastKey}
        message={deletedEventToastMessage}
        onDismiss={clearDeletedEventToast}
        actionLabel="Undo"
        onAction={restoreDeletedCalendarEvent}
      />

      <AutoDismissToast
        key={eventSaveErrorToastKey}
        message={eventSaveErrorMessage}
        onDismiss={clearEventSaveErrorToast}
      />
    </View>
  );
}
