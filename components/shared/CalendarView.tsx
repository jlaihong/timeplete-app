import React, { useState, useMemo, useRef, useCallback, useEffect } from "react";
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
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDateLong,
  formatSecondsAsHM,
} from "../../lib/dates";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useTimer } from "../../hooks/useTimer";
import { Id } from "../../convex/_generated/dataModel";
import { DEFAULT_EVENT_COLOR } from "../../lib/eventColors";

/* ────────────────────────────────────────────────────────────────────────
 *  Constants
 *
 *  Productivity-One uses FullCalendar with `slotDuration: '00:05:00'` and
 *  `snapDuration: '00:05:00'`. We mirror that with a pixel-per-minute grid:
 *  `PX_PER_MINUTE = 1` gives `HOUR_HEIGHT = 60` (matches the previous
 *  `minHeight: 60` so visual density is unchanged).
 *
 *  The big change vs the old layout is that events no longer live as flow
 *  children of an hour cell — they're absolute-positioned in a single
 *  layer over the entire 24h timeline, so a 30 min event renders at 30 px
 *  (= half a 1-hour slot), a 5 min event renders at 5 px, etc.
 * ──────────────────────────────────────────────────────────────────────── */
const PX_PER_MINUTE = 1;
const HOUR_HEIGHT = 60 * PX_PER_MINUTE;
const DAY_MINUTES = 24 * 60;
const DAY_HEIGHT = DAY_MINUTES * PX_PER_MINUTE;
const SNAP_MINUTES = 5;
const MIN_DURATION_MINUTES = 5;
const MIN_DURATION_SECONDS = MIN_DURATION_MINUTES * 60;
const DEFAULT_DROP_DURATION = 1800;
const HOUR_LABEL_WIDTH = 56;
const RESIZE_HANDLE_HEIGHT = 6;
const HOUR_DROPPABLE_PREFIX = "cal-hour-";
const isWeb = Platform.OS === "web";

/* ────────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────────── */
interface DropPreview {
  /** Absolute minute-of-day (0-1440). Already snapped to SNAP_MINUTES. */
  startMinutes: number;
  durationMinutes: number;
  color: string;
  taskName: string;
}

interface ActiveTaskDrag {
  taskId: string;
  durationSec: number;
  color: string;
  taskName: string;
}

type EventInteractionMode = "drag" | "resize-top" | "resize-bottom";

interface TimeWindowDoc {
  _id: string;
  startTimeHHMM: string;
  startDayYYYYMMDD: string;
  durationSeconds: number;
  budgetType: "ACTUAL" | "BUDGETED";
  activityType: "TASK" | "EVENT" | "TRACKABLE";
  taskId?: string;
  trackableId?: string;
  title?: string;
  comments?: string;
  tagIds?: string[];
  timeZone: string;
  recurringEventId?: string;
  isRecurringInstance?: boolean;
  source?: "timer" | "manual" | "calendar" | "tracker_entry";
  isLive?: boolean;
  /**
   * Server-computed by `convex/timeWindows.ts:search`:
   *   - `displayColor` = trackable.colour ?? list.colour ?? DEFAULT_EVENT_COLOR
   *   - `secondaryColor` = list.colour ONLY when both trackable + list
   *     colours exist and differ (the "list stripe" dual-colour case).
   * Optional because the live-timer pseudo-event constructed client-side
   * doesn't go through the server query.
   */
  displayColor?: string;
  secondaryColor?: string;
}

interface CalendarViewProps {
  title?: string;
  onAddEvent?: (day: string) => void;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────────────────── */
function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

function minutesToHHMM(min: number): string {
  const safe = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(min)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function snapMinutes(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function formatClockTime(absMinutes: number): string {
  const safe = ((Math.round(absMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, "0");
  return `${displayHour}:${mm} ${period}`;
}

function withAlpha(hex: string, alphaHex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return `${hex}${alphaHex}`;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Adaptive event-content tier — productivity-one parity for short blocks.
 *
 *  Title is the single piece of content the user actually needs at every
 *  size. P1 lets FullCalendar prioritise the title and only adds time +
 *  duration + badges when there's vertical room. We do the same with
 *  explicit tiers + per-tier padding so even a 30-minute (~30 px) tile
 *  always shows its name. Critical: the previous tiering reserved 6px
 *  top + 6px bottom for resize handles AND tried to fit title + time at
 *  medium, which left 0 px of usable vertical room → blank tile. The
 *  new tiers shrink handles + drop the time row earlier.
 *
 *  Tiers (height in px ≈ duration in minutes because PX_PER_MINUTE = 1):
 *
 *    mini   ( <14): truncated title, 9 px font,    handles=0, pad=1
 *    small  (14-29): title only,    11 px font,    handles=0, pad=2
 *    medium (30-49): title only,    12 px font,    handles=4, pad=0
 *    large  ( ≥50): title + time,   13/11 px,      handles=6, pad=0
 *                   + duration + budget/live badge at ≥60 px
 *
 *  Title is rendered at every tier with `numberOfLines={1}` so long
 *  names ellipsize instead of disappearing.
 * ──────────────────────────────────────────────────────────────────────── */
type EventSizeTier = "mini" | "small" | "medium" | "large";

interface TierLayout {
  tier: EventSizeTier;
  /** Pixel height of each resize handle (top + bottom). 0 = no handles. */
  handlePx: number;
  /** Vertical padding inside the body, applied above the handles. */
  padTop: number;
  padBottom: number;
  /** Horizontal padding (small tiers shrink to fit). */
  padHorizontal: number;
  /** True when the time row should be rendered. */
  showTime: boolean;
  /** True when the duration suffix on the time row should be rendered. */
  showDuration: boolean;
  /** True when budget/live badges should render. */
  showBadges: boolean;
}

function pickTierLayout(height: number): TierLayout {
  if (height < 14) {
    return {
      tier: "mini",
      handlePx: 0,
      padTop: 1,
      padBottom: 1,
      padHorizontal: 4,
      showTime: false,
      showDuration: false,
      showBadges: false,
    };
  }
  if (height < 30) {
    return {
      tier: "small",
      handlePx: 0,
      padTop: 2,
      padBottom: 2,
      padHorizontal: 5,
      showTime: false,
      showDuration: false,
      showBadges: false,
    };
  }
  if (height < 50) {
    return {
      tier: "medium",
      handlePx: 4,
      padTop: 0,
      padBottom: 0,
      padHorizontal: 6,
      showTime: false,
      showDuration: false,
      showBadges: false,
    };
  }
  return {
    tier: "large",
    handlePx: RESIZE_HANDLE_HEIGHT,
    padTop: 0,
    padBottom: 0,
    padHorizontal: 6,
    showTime: true,
    // Duration + badges only render when the tile is tall enough that
    // they don't push the title out (≥ 60 px ≈ 1 hour).
    showDuration: height >= 60,
    showBadges: height >= 60,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Lane packing for overlapping events (productivity-one parity).
 *
 *  Without this, two events that share any time range stack on top of
 *  each other (both `position: absolute; left: 0; right: 0`) and the
 *  one rendered later visually covers the earlier one — totally
 *  unreadable.
 *
 *  The standard FullCalendar / Google-Calendar approach is to pack
 *  overlapping events into vertical "lanes", then split the available
 *  width evenly per lane. We use a sweep-line greedy variant:
 *
 *    1. Sort events by start ascending, break ties by end descending
 *       (longer events get the leftmost lane, mirroring FullCalendar).
 *    2. For each event, find the lowest-index lane whose last placed
 *       event has ALREADY ENDED by this event's start time. If none
 *       exists, open a new lane.
 *    3. For each event, count `laneCount` = max(lane index + 1) over
 *       every event whose time interval overlaps this one. This way an
 *       event whose group has 3 lanes (because somewhere in its span 3
 *       events overlap simultaneously) gets 1/3 width even if it
 *       personally only overlaps 2 others — matches what users expect
 *       from a calendar grid.
 *
 *  Complexity is O(n²); n is bounded by ~24 events per day in practice
 *  so this is negligible vs the React render cost downstream.
 * ──────────────────────────────────────────────────────────────────────── */
interface EventLayout {
  /** 0-indexed lane within the event's overlap group. */
  lane: number;
  /** Total lanes occupied during this event's span. */
  laneCount: number;
}

function packOverlappingEvents(
  windows: TimeWindowDoc[]
): Map<string, EventLayout> {
  const items = windows.map((w) => {
    const start = hhmmToMinutes(w.startTimeHHMM);
    const end =
      start +
      Math.max(MIN_DURATION_MINUTES, Math.round(w.durationSeconds / 60));
    return { id: w._id, start, end };
  });
  items.sort((a, b) => a.start - b.start || b.end - a.end);

  const laneEnds: number[] = [];
  const laneByItem = new Map<string, number>();
  for (const it of items) {
    let lane = laneEnds.findIndex((end) => end <= it.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.end);
    } else {
      laneEnds[lane] = it.end;
    }
    laneByItem.set(it.id, lane);
  }

  const result = new Map<string, EventLayout>();
  for (const it of items) {
    const lane = laneByItem.get(it.id)!;
    let maxLane = lane;
    for (const other of items) {
      if (other.id === it.id) continue;
      const overlaps = other.start < it.end && it.start < other.end;
      if (!overlaps) continue;
      const otherLane = laneByItem.get(other.id)!;
      if (otherLane > maxLane) maxLane = otherLane;
    }
    result.set(it.id, { lane, laneCount: maxLane + 1 });
  }
  return result;
}

/* ────────────────────────────────────────────────────────────────────────
 *  HourSlot — fixed-height droppable backdrop row.
 *
 *  Renders the hour label + grid line. Events do NOT live here anymore —
 *  they're absolute-positioned in `EventLayer` over the entire timeline so
 *  their height accurately reflects duration. This row exists purely as a
 *  visual guide and as a `useDroppable` target for task→calendar drops.
 * ──────────────────────────────────────────────────────────────────────── */
interface HourSlotProps {
  hour: number;
  registerEl: (hour: number, node: HTMLElement | null) => void;
  isOverPreview: boolean;
}

function HourSlot({ hour, registerEl, isOverPreview }: HourSlotProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${HOUR_DROPPABLE_PREFIX}${hour}`,
  });

  const setRefs = useCallback(
    (node: any) => {
      setNodeRef(node ?? null);
      registerEl(hour, (node as HTMLElement) ?? null);
    },
    [setNodeRef, registerEl, hour]
  );

  return (
    <View
      ref={setRefs as any}
      style={[
        styles.hourSlot,
        (isOver || isOverPreview) && styles.hourSlotDropTarget,
      ]}
    >
      <View style={styles.hourLine} />
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  CalendarEventBlock — interactive absolute-positioned event card.
 *
 *  Owns its own drag/resize state so only this single event re-renders
 *  during pointer interaction (the parent timeline + 23 sibling events
 *  don't re-render every frame). Pointer interactions use plain
 *  `window.pointermove` / `pointerup` listeners attached on pointerdown,
 *  rather than dnd-kit. This is intentional:
 *
 *    1. dnd-kit's PointerSensor only listens on elements registered via
 *       `useDraggable`, so a plain `onPointerDown` here doesn't conflict
 *       with the task-from-list drag system.
 *    2. dnd-kit imposes an activation threshold (5 px in our config), which
 *       would require the user to overshoot before any visual feedback —
 *       that's wrong for in-place drag/resize where we want instant
 *       response.
 *
 *  Hit areas (top to bottom):
 *    [0, 6 px]              → resize top (`ns-resize` cursor)
 *    [6 px, height-6 px]    → drag to move (`grab`/`grabbing` cursor)
 *    [height-6 px, height]  → resize bottom (`ns-resize` cursor)
 *
 *  When the event is shorter than 18 px, resize handles are suppressed
 *  (drag-only) to avoid the entire card being a handle.
 * ──────────────────────────────────────────────────────────────────────── */
interface CalendarEventBlockProps {
  tw: TimeWindowDoc;
  /** Lane assignment from `packOverlappingEvents`. */
  layout: EventLayout;
  /** Notify parent to persist start/duration changes. */
  onCommit: (id: string, startMinutes: number, durationMinutes: number) => void;
}

function CalendarEventBlock({ tw, layout, onCommit }: CalendarEventBlockProps) {
  const baseStart = useMemo(() => hhmmToMinutes(tw.startTimeHHMM), [tw.startTimeHHMM]);
  const baseDuration = useMemo(
    () => Math.max(MIN_DURATION_MINUTES, Math.round(tw.durationSeconds / 60)),
    [tw.durationSeconds]
  );

  // Live draft during interaction (cleared on pointerup).
  const [draft, setDraft] = useState<{
    start: number;
    duration: number;
  } | null>(null);
  // Held after commit until the server reflects the new values, so the card
  // doesn't visually "snap back" to the old position between the mutation
  // resolving locally and the query refetch.
  const [pendingCommit, setPendingCommit] = useState<{
    start: number;
    duration: number;
  } | null>(null);

  useEffect(() => {
    if (
      pendingCommit &&
      pendingCommit.start === baseStart &&
      pendingCommit.duration === baseDuration
    ) {
      setPendingCommit(null);
    }
  }, [baseStart, baseDuration, pendingCommit]);

  const renderStart = draft?.start ?? pendingCommit?.start ?? baseStart;
  const renderDuration = draft?.duration ?? pendingCommit?.duration ?? baseDuration;
  const top = renderStart * PX_PER_MINUTE;
  const height = Math.max(
    MIN_DURATION_MINUTES * PX_PER_MINUTE,
    renderDuration * PX_PER_MINUTE
  );

  const isLive = !!tw.isLive;
  const isInteractive = isWeb && !isLive;
  const tierLayout = pickTierLayout(height);
  const showHandles = isInteractive && tierLayout.handlePx > 0;
  const handlePx = showHandles ? tierLayout.handlePx : 0;

  const startInteraction = useCallback(
    (mode: EventInteractionMode, ev: any) => {
      // Stop bubbling so the parent calendar doesn't see this as a
      // generic timeline click and so dnd-kit's document-level sensors
      // (if they ever start listening for non-draggable activity) won't
      // get confused. preventDefault keeps the browser from initiating
      // text-selection while dragging.
      if (typeof ev?.stopPropagation === "function") ev.stopPropagation();
      if (typeof ev?.preventDefault === "function") ev.preventDefault();

      const startY: number =
        typeof ev?.clientY === "number"
          ? ev.clientY
          : (ev?.nativeEvent?.clientY ?? 0);
      const initialStart = baseStart;
      const initialDuration = baseDuration;
      const initialEnd = initialStart + initialDuration;

      const compute = (clientY: number) => {
        const deltaY = clientY - startY;
        const deltaMin = snapMinutes(deltaY / PX_PER_MINUTE);
        if (mode === "drag") {
          const newStart = clamp(
            initialStart + deltaMin,
            0,
            DAY_MINUTES - initialDuration
          );
          return { start: newStart, duration: initialDuration };
        }
        if (mode === "resize-top") {
          const newStart = clamp(
            initialStart + deltaMin,
            0,
            initialEnd - MIN_DURATION_MINUTES
          );
          return { start: newStart, duration: initialEnd - newStart };
        }
        // resize-bottom
        const newDuration = clamp(
          initialDuration + deltaMin,
          MIN_DURATION_MINUTES,
          DAY_MINUTES - initialStart
        );
        return { start: initialStart, duration: newDuration };
      };

      const onMove = (e: PointerEvent) => {
        setDraft(compute(e.clientY));
      };
      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        const finalDraft = compute(e.clientY);
        setDraft(null);
        if (
          finalDraft.start !== initialStart ||
          finalDraft.duration !== initialDuration
        ) {
          setPendingCommit(finalDraft);
          onCommit(tw._id, finalDraft.start, finalDraft.duration);
        }
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [baseStart, baseDuration, onCommit, tw._id]
  );

  // Colour composition — server-provided `displayColor` (trackable
  // ?? list ?? DEFAULT) is rendered as a translucent fill so the
  // calendar feels lightweight and layered (matches the previous
  // Timeplete revision before the WCAG-contrast pass made everything
  // opaque). The bright accent gets re-used for:
  //   • the always-visible left edge (3 px, fully opaque),
  //   • the dual-colour stripe (4 px in `secondaryColor`, fully opaque)
  //   • the time row text colour, so the brand colour reads through.
  // Title text uses the theme's primary text colour, which has good
  // contrast against the dark base + thin colour tint.
  const displayColor = tw.displayColor ?? DEFAULT_EVENT_COLOR;
  const stripeColor = tw.secondaryColor;
  const isInteracting = draft !== null;
  // Translucent backgrounds: 26 (≈15%) for normal, 33 (≈20%) when
  // dragging so the user can see the moved tile lift off the surface.
  const tintAlpha = isInteracting ? "33" : "26";
  const backgroundColor = withAlpha(displayColor, tintAlpha);

  // RN-Web forwards `onPointerDown` and `style.cursor` at runtime, but the
  // TS types don't expose them on `ViewProps`. Bundle them as web-only
  // props (same pattern used elsewhere — see TaskRowDesktop).
  const bodyHandlers = isInteractive
    ? ({
        onPointerDown: (e: any) => startInteraction("drag", e),
        style: [
          styles.eventBody,
          {
            cursor: isInteracting ? "grabbing" : "grab",
            paddingTop: tierLayout.padTop,
            paddingBottom: tierLayout.padBottom,
            paddingHorizontal: tierLayout.padHorizontal,
          } as any,
        ],
      } as Record<string, unknown>)
    : ({
        style: [
          styles.eventBody,
          {
            paddingTop: tierLayout.padTop,
            paddingBottom: tierLayout.padBottom,
            paddingHorizontal: tierLayout.padHorizontal,
          } as any,
        ],
      } as Record<string, unknown>);

  const topHandleProps = showHandles
    ? ({
        onPointerDown: (e: any) => startInteraction("resize-top", e),
        style: [
          styles.resizeHandle,
          { height: handlePx, cursor: "ns-resize" } as any,
        ],
      } as Record<string, unknown>)
    : null;
  const bottomHandleProps = showHandles
    ? ({
        onPointerDown: (e: any) => startInteraction("resize-bottom", e),
        style: [
          styles.resizeHandle,
          { height: handlePx, cursor: "ns-resize" } as any,
        ],
      } as Record<string, unknown>)
    : null;

  // Title fallback ladder mirrors P1 (`interactive-calendar-event-factory.service.ts:128-133`):
  // task/trackable name (server-enriched into `tw.title`), then a
  // sensible activityType label. We never render an empty string —
  // the spec demands "text should NEVER fully disappear".
  const fallbackByType =
    tw.activityType === "EVENT"
      ? "Event"
      : tw.activityType === "TRACKABLE"
        ? "Trackable"
        : "Task";
  const displayTitle =
    (tw.title && tw.title.trim()) ||
    (isLive ? "Timer running…" : fallbackByType);

  // Per-tier text styles. Title is ALWAYS rendered (numberOfLines=1 +
  // ellipsis). Time row only when the tier flags it.
  const titleStyle =
    tierLayout.tier === "mini"
      ? styles.eventTitleMini
      : tierLayout.tier === "small"
        ? styles.eventTitleSmall
        : tierLayout.tier === "medium"
          ? styles.eventTitleMedium
          : styles.eventTitleLarge;

  // Lane packing: split the events layer width between overlapping
  // tiles. The OUTER `slot` carries the absolute position + width so
  // we can use `paddingLeft`/`paddingRight` to create the inter-event
  // gap WITHOUT bleeding the tile's translucent background into the
  // gutter (which would happen if we put the bg on the positioned
  // element directly).
  const colWidthPercent = 100 / Math.max(1, layout.laneCount);
  const leftPercent = layout.lane * colWidthPercent;
  const slotPaddingLeft = layout.lane > 0 ? 1 : 0;
  const slotPaddingRight = layout.lane < layout.laneCount - 1 ? 1 : 0;

  return (
    <View
      style={[
        styles.eventSlot,
        {
          top,
          height,
          left: `${leftPercent}%` as unknown as number,
          width: `${colWidthPercent}%` as unknown as number,
          paddingLeft: slotPaddingLeft,
          paddingRight: slotPaddingRight,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        style={[
          styles.eventBlock,
          {
            backgroundColor,
            // Always show a left edge in the displayColor (3 px,
            // opaque) so single-colour events still have an obvious
            // accent. When dual-coloured, swap to a 4 px stripe in
            // the secondary (list) colour — matches P1's
            // `applyListStripeStyles`.
            borderLeftWidth: stripeColor ? 4 : 3,
            borderLeftColor: stripeColor ?? displayColor,
          },
          isLive && styles.eventBlockLive,
          isInteracting && styles.eventBlockDragging,
        ]}
      >
        {topHandleProps && <View {...topHandleProps} />}
        <View {...bodyHandlers}>
          {/* While dragging or resizing, swap the title for the live
              start–end times so the user can see exactly what slot
              they're moving the event to. The time text reuses the
              tier-appropriate title style so it fits the same
              vertical room — even a 30-minute tile shows the new
              window. (When not interacting we render the title first
              because the body uses `flex-start` + `overflow:hidden`
              and the first child is what's guaranteed visible.) */}
          {isInteracting ? (
            <Text
              style={[titleStyle, { color: Colors.text }]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              {formatClockTime(renderStart)} – {formatClockTime(renderStart + renderDuration)}
              {tierLayout.tier === "large" ? (
                <Text
                  style={[
                    styles.eventDuration,
                    { color: Colors.textSecondary },
                  ]}
                >
                  {"  "}({formatSecondsAsHM(renderDuration * 60)})
                </Text>
              ) : null}
            </Text>
          ) : (
            <>
              <Text
                style={[titleStyle, { color: Colors.text }]}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {displayTitle}
              </Text>
              {tierLayout.showTime && (
                <Text
                  style={[styles.eventTime, { color: displayColor }]}
                  numberOfLines={1}
                >
                  {formatClockTime(renderStart)} – {formatClockTime(renderStart + renderDuration)}
                  {tierLayout.showDuration ? (
                    <>
                      {"  "}
                      <Text
                        style={[
                          styles.eventDuration,
                          { color: Colors.textSecondary },
                        ]}
                      >
                        ({formatSecondsAsHM(renderDuration * 60)})
                      </Text>
                    </>
                  ) : null}
                </Text>
              )}
              {tw.budgetType === "BUDGETED" && tierLayout.showBadges && (
                <Text style={[styles.budgetBadge, { color: Colors.warning }]}>
                  Budgeted
                </Text>
              )}
              {isLive && tierLayout.showBadges && (
                <Text style={styles.liveBadge}>Live</Text>
              )}
            </>
          )}
        </View>
        {bottomHandleProps && <View {...bottomHandleProps} />}
      </View>
    </View>
  );
}

/* ────────────────────────────────────────────────────────────────────────
 *  CalendarView
 * ──────────────────────────────────────────────────────────────────────── */
export function CalendarView({ title, onAddEvent }: CalendarViewProps) {
  const isDesktop = useIsDesktop();
  const [selectedDay, setSelectedDay] = useState(todayYYYYMMDD());
  const [dropPreview, setDropPreview] = useState<DropPreview | null>(null);

  const timeWindows = useQuery(api.timeWindows.search, {
    startDay: selectedDay,
    endDay: selectedDay,
  });
  const upsertTimeWindow = useMutation(api.timeWindows.upsert);
  const timerHook = useTimer();

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

  const totalDuration = useMemo(() => {
    if (!timeWindows) return 0;
    return (timeWindows as TimeWindowDoc[])
      .filter((w) => w.budgetType === "ACTUAL")
      .reduce((sum, w) => sum + w.durationSeconds, 0);
  }, [timeWindows]);

  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);

  /* ─── Task→Calendar drop (via dnd-kit) ───────────────────────────── */
  const handleTaskDrop = useCallback(
    (
      taskId: string,
      startMinutes: number,
      durationSec: number,
      taskName: string
    ) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      void upsertTimeWindow({
        startTimeHHMM: minutesToHHMM(startMinutes),
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

  useDndMonitor({
    onDragStart: onDndDragStart,
    onDragMove: onDndDragMove,
    onDragEnd: onDndDragEnd,
    onDragCancel: onDndDragCancel,
  });

  /* ─── In-calendar event drag/resize commit ───────────────────────── */
  /**
   * Persist a moved or resized event. We must spread *all* existing
   * fields because `timeWindows.upsert` does a full replacement (`patch`
   * with the supplied keys) — omitting e.g. `taskId` would null it out
   * on the server and turn the row into a generic "EVENT".
   */
  const handleEventUpdate = useCallback(
    (id: string, startMinutes: number, durationMinutes: number) => {
      const tw = sortedWindows.find((w) => w._id === id);
      if (!tw) return;
      void upsertTimeWindow({
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
        title: tw.title,
        comments: tw.comments,
        tagIds: tw.tagIds as Id<"tags">[] | undefined,
        timeZone: tw.timeZone,
        source: tw.source,
      });
    },
    [sortedWindows, upsertTimeWindow]
  );

  /* ─── Live timer pseudo-event ─────────────────────────────────────── */
  const liveTimerWindow = useMemo<TimeWindowDoc | null>(() => {
    if (!timerHook.isRunning) return null;
    const timerDay = todayYYYYMMDD();
    if (timerDay !== selectedDay) return null;
    const startSec =
      timerHook.elapsed > 0
        ? Date.now() / 1000 - timerHook.elapsed
        : Date.now() / 1000;
    const startDate = new Date(startSec * 1000);
    const hh = String(startDate.getHours()).padStart(2, "0");
    const mm = String(startDate.getMinutes()).padStart(2, "0");
    return {
      _id: "__live_timer__",
      startTimeHHMM: `${hh}:${mm}`,
      startDayYYYYMMDD: selectedDay,
      durationSeconds: timerHook.elapsed,
      activityType: timerHook.taskId ? "TASK" : "TRACKABLE",
      budgetType: "ACTUAL",
      title: "Timer running…",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      isLive: true,
      // Live timer uses the success accent (matches P1's pulsing-green
      // live-timer-event class). The component still wraps the bg through
      // the contrast pipeline so the green is text-readable.
      displayColor: Colors.success,
    };
  }, [timerHook.isRunning, timerHook.elapsed, timerHook.taskId, selectedDay]);

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
    () => packOverlappingEvents(eventsToRender),
    [eventsToRender]
  );

  const previewTop = dropPreview ? dropPreview.startMinutes * PX_PER_MINUTE : 0;
  const previewHeight = dropPreview
    ? Math.max(MIN_DURATION_MINUTES * PX_PER_MINUTE, dropPreview.durationMinutes * PX_PER_MINUTE)
    : 0;
  const previewEnd = dropPreview
    ? dropPreview.startMinutes + dropPreview.durationMinutes
    : 0;
  const overHourFromPreview = dropPreview
    ? Math.floor(dropPreview.startMinutes / 60)
    : -1;

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
          <View style={styles.gridColumn}>
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
                  // Render the live timer as a non-interactive block at its
                  // current start. CalendarEventBlock already short-circuits
                  // interaction for `tw.isLive`.
                  return (
                    <CalendarEventBlock
                      key={tw._id}
                      tw={tw}
                      layout={layout}
                      onCommit={() => undefined}
                    />
                  );
                }
                return (
                  <CalendarEventBlock
                    key={tw._id}
                    tw={tw}
                    layout={layout}
                    onCommit={handleEventUpdate}
                  />
                );
              })}

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
        </View>
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

/* ────────────────────────────────────────────────────────────────────────
 *  Styles
 * ──────────────────────────────────────────────────────────────────────── */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
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
  summary: { alignItems: "center", paddingBottom: 8, paddingTop: 4 },
  summaryText: { fontSize: 13, color: Colors.textSecondary },
  timeline: { flex: 1 },
  timelineContent: { paddingHorizontal: 16, paddingBottom: 80 },

  // Timeline surface = labels column + grid column, side by side.
  timelineSurface: {
    flexDirection: "row",
    position: "relative",
  },
  labelsColumn: { width: HOUR_LABEL_WIDTH },
  hourLabelRow: {
    height: HOUR_HEIGHT,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 2,
    paddingRight: 8,
  },
  hourLabel: { fontSize: 12, color: Colors.textTertiary },

  gridColumn: {
    flex: 1,
    position: "relative",
    borderLeftWidth: 1,
    borderLeftColor: Colors.outlineVariant,
  },
  hourSlot: { height: HOUR_HEIGHT, paddingLeft: 12 },
  hourSlotDropTarget: {
    backgroundColor: Colors.primary + "10",
  },
  hourLine: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
  },

  eventsLayer: {
    position: "absolute",
    top: 0,
    left: 12,
    right: 4,
    bottom: 0,
  },

  // Outer wrapper that owns the absolute position + lane width. The
  // wrapper is intentionally background-less so the inter-event gap
  // (`paddingLeft` / `paddingRight` set inline per-event) doesn't bleed
  // the tile's translucent fill into the gutter between overlapping
  // events.
  eventSlot: {
    position: "absolute",
    zIndex: 2,
  },
  // Inner event card. `flex: 1` makes it fill the slot's content area
  // (slot - inter-event padding). The translucent background, left
  // stripe, and rounded corners all live here.
  eventBlock: {
    flex: 1,
    borderRadius: 4,
    overflow: "hidden",
    ...Platform.select({
      web: {
        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
      } as any,
      default: {},
    }),
  },
  eventBlockLive: {
    // P1 wraps the live-timer event in a 2px green border + pulse glow.
    // We keep the border (animation is web-only and lives in the global
    // pulse-green keyframes; for now the static border is enough to
    // signal liveness). `borderColor` overrides the per-event left
    // stripe colour for live events.
    borderColor: Colors.success,
    borderWidth: 2,
    borderLeftWidth: 2,
    ...Platform.select({
      web: {
        boxShadow: "0 0 8px rgba(2, 230, 0, 0.5)",
      } as any,
      default: {},
    }),
  },
  eventBlockDragging: {
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
      } as any,
      default: {},
    }),
    zIndex: 10,
  },
  eventBody: {
    flex: 1,
    justifyContent: "flex-start",
    overflow: "hidden",
  },
  resizeHandle: {
    // Width fills the parent; height is set inline per-tier so the
    // shorter tiles get smaller hit areas (4 px) and don't crowd out
    // the title.
  },

  // Title text — one style per size tier. `lineHeight` is set tight
  // so even the smallest tile fits the text without clipping
  // descenders. `fontWeight: 600` keeps the title legible against the
  // translucent tinted background.
  eventTitleMini: {
    fontSize: 9,
    lineHeight: 10,
    fontWeight: "600",
  },
  eventTitleSmall: {
    fontSize: 11,
    lineHeight: 12,
    fontWeight: "600",
  },
  eventTitleMedium: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: "600",
  },
  eventTitleLarge: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },

  // Time row — colour applied inline (uses the event's displayColor
  // for visual tie-back to the trackable/list).
  eventTime: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: "500",
    marginTop: 2,
  },
  eventDuration: {
    fontSize: 11,
    fontWeight: "400",
  },

  budgetBadge: {
    fontSize: 10,
    fontWeight: "600",
    marginTop: 2,
  },
  liveBadge: {
    fontSize: 10,
    color: Colors.background,
    backgroundColor: Colors.success,
    fontWeight: "700",
    marginTop: 2,
    paddingHorizontal: 4,
    borderRadius: 3,
    alignSelf: "flex-start",
  },

  dropGhost: {
    position: "absolute",
    left: 0,
    right: 0,
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
  dropGhostText: { fontSize: 12, fontWeight: "600" },
  dropGhostDuration: { fontSize: 11, fontWeight: "400" },
  dropGhostTitle: { fontSize: 11, fontWeight: "500", marginTop: 2 },

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
