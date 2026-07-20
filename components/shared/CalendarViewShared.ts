import { Platform } from "react-native";
import { Id } from "../../convex/_generated/dataModel";
import { wallClockInTimeZone, wallClockGridToEpochMs } from "../../lib/wallClockTimeZone";

/* ────────────────────────────────────────────────────────────────────────
 *  Constants
 *
 *  Productivity-One uses FullCalendar with `slotDuration: '00:05:00'` and
 *  `snapDuration: '00:05:00'`. We mirror that with a pixel-per-minute grid:
 *  `PX_PER_MINUTE = 2` doubles the day timeline vs the original 1 px/min
 *  so hour rows and snap targets are easier to hit. Events shorter than
 *  five minutes still *render* at five minutes tall (see `eventBlockHeightPx`);
 *  persisted times are unchanged.
 *
 *  Events are absolute-positioned over the 24h timeline: a 30 min block is
 *  30 × PX_PER_MINUTE px tall.
 * ──────────────────────────────────────────────────────────────────────── */
export const PX_PER_MINUTE = 2;
export const HOUR_HEIGHT = 60 * PX_PER_MINUTE;
export const DAY_MINUTES = 24 * 60;
export const DAY_HEIGHT = DAY_MINUTES * PX_PER_MINUTE;
export const SNAP_MINUTES = 5;
export const MIN_DURATION_MINUTES = 5;
export const MIN_DURATION_SECONDS = MIN_DURATION_MINUTES * 60;
export const DEFAULT_DROP_DURATION = 1800;
/**
 * Default duration in minutes for an event the user creates by clicking
 * an empty calendar slot without dragging far enough to define a real
 * range (e.g. micro-drags below the snap grid). Matches the spec
 * ("Very small drag → default to minimum duration, e.g. 15 min").
 */
export const DEFAULT_CREATE_DURATION_MINUTES = 15;
/**
 * Pixel distance the user must move from the initial pointerdown before
 * we treat the gesture as a "create new event" drag (vs an accidental
 * micro-movement / click). Matches the spec ("5–10 px") and is large
 * enough to keep stray clicks on empty slots from spawning events.
 */
export const CREATE_DRAG_THRESHOLD_PX = 5;
export const HOUR_LABEL_WIDTH = 56;
export const RESIZE_HANDLE_HEIGHT = 6;
/** Minimum vertical hit strip for resize; capped per-side so tiny tiles keep a draggable middle. */
export const RESIZE_EDGE_HIT_MIN_PX = 10;
/** Minimum height of the center band where move/drag is preferred (grab cursor). */
export const MIN_DRAG_MIDDLE_BAND_PX = 8;
/** Pseudo–time window row for the in-progress timer (not a Convex document). */
export const LIVE_TIMER_EVENT_ID = "__live_timer__";
export const HOUR_DROPPABLE_PREFIX = "cal-hour-";
export const isWeb = Platform.OS === "web";
/** iOS-calendar-style red accent for “now” on today's timeline */
export const CURRENT_TIME_LINE_COLOR = "#FF3B30";
/** Roughly one-third of a typical viewport so “now” is not glued to the top edge */
export const SCROLL_PADDING_ABOVE_NOW_PX = 160;

/**
 * `wallClockGridToEpochMs` scans minutes in a ±40h window — fine once, but N
 * rows × no `startTimeEpochMs` stalls the JS thread long enough that web
 * font loading hits its 6000ms timeout on large days.
 */
const WALL_CLOCK_GRID_EPOCH_CACHE = new Map<string, number>();
const WALL_CLOCK_GRID_EPOCH_CACHE_LIMIT = 6144;

export function cachedWallClockGridToEpochMs(
  dayYYYYMMDD: string,
  minutesFromMidnight: number,
  tz: string,
): number {
  const key = `${dayYYYYMMDD}\n${minutesFromMidnight}\n${tz}`;
  const hit = WALL_CLOCK_GRID_EPOCH_CACHE.get(key);
  if (hit !== undefined) return hit;
  const v = wallClockGridToEpochMs(dayYYYYMMDD, minutesFromMidnight, tz);
  if (WALL_CLOCK_GRID_EPOCH_CACHE.size >= WALL_CLOCK_GRID_EPOCH_CACHE_LIMIT) {
    WALL_CLOCK_GRID_EPOCH_CACHE.clear();
  }
  WALL_CLOCK_GRID_EPOCH_CACHE.set(key, v);
  return v;
}

/** On-screen height: at least five minutes of grid, even when the event is shorter. */
export function eventBlockHeightPx(durationMinutes: number): number {
  return Math.max(MIN_DURATION_MINUTES, durationMinutes) * PX_PER_MINUTE;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Types
 * ──────────────────────────────────────────────────────────────────────── */
export interface DropPreview {
  /** Absolute minute-of-day (0-1440). Already snapped to SNAP_MINUTES. */
  startMinutes: number;
  durationMinutes: number;
  color: string;
  taskName: string;
}

export interface ActiveTaskDrag {
  taskId: string;
  durationSec: number;
  color: string;
  taskName: string;
}

export type EventInteractionMode = "drag" | "resize-top" | "resize-bottom";

export interface TimeWindowDoc {
  _id: string;
  startTimeHHMM: string;
  startDayYYYYMMDD: string;
  durationSeconds: number;
  budgetType: "ACTUAL" | "BUDGETED";
  activityType: "TASK" | "EVENT" | "TRACKABLE";
  taskId?: string;
  trackableId?: string;
  listId?: string;
  /**
   * The PERSISTED title:
   *   - `undefined` → no explicit title; render `displayTitle` (which
   *     reflects the latest derived name from the linked entity).
   *   - non-empty   → user-entered explicit title; survives entity
   *     renames.
   *
   * Rendering should use `displayTitle`. Edit/move flows that re-issue
   * `upsert` MUST send this field (not `displayTitle`) so the
   * explicit/derived distinction is preserved on the round trip.
   */
  title?: string;
  comments?: string;
  tagIds?: string[];
  timeZone: string;
  /** Canonical UTC start instant when present (authoritative positioning). */
  startTimeEpochMs?: number;
  recurringEventId?: string;
  isRecurringInstance?: boolean;
  source?: "timer" | "manual" | "calendar" | "tracker_entry";
  isLive?: boolean;
  /**
   * Server-computed by `convex/timeWindows.ts:search`:
   *   - `displayTitle`  = title ?? derivedTitle ?? "Untitled" (the
   *     string the calendar should render).
   *   - `derivedTitle`  = name from linked list / trackable / task
   *     (what would render with no explicit title). The edit dialog
   *     uses this as a placeholder and to detect "user typed something
   *     identical to the derived name → save as derived".
   *   - `displayColor`  = trackable.colour ?? list.colour ?? DEFAULT_EVENT_COLOR
   *   - `secondaryColor`= list.colour ONLY when both trackable + list
   *     colours exist and differ (the "list stripe" dual-colour case).
   * All optional because the live-timer pseudo-event constructed
   * client-side doesn't go through the server query.
   */
  displayTitle?: string;
  derivedTitle?: string;
  displayColor?: string;
  secondaryColor?: string;
}

/** Convex `upsert` args rebuilt from a calendar row for undo-after-delete. */
export function undoUpsertPayloadFromCalendarRow(tw: TimeWindowDoc) {
  return {
    startTimeHHMM: tw.startTimeHHMM,
    startDayYYYYMMDD: tw.startDayYYYYMMDD,
    durationSeconds: tw.durationSeconds,
    budgetType: tw.budgetType,
    activityType: tw.activityType,
    taskId: tw.taskId ? (tw.taskId as Id<"tasks">) : undefined,
    trackableId: tw.trackableId ? (tw.trackableId as Id<"trackables">) : undefined,
    listId: tw.listId ? (tw.listId as Id<"lists">) : undefined,
    title: tw.title,
    comments: tw.comments,
    tagIds:
      Array.isArray(tw.tagIds) && tw.tagIds.length > 0
        ? (tw.tagIds as Id<"tags">[])
        : undefined,
    timeZone: tw.timeZone,
    source: tw.source,
    recurringEventId: tw.recurringEventId
      ? (tw.recurringEventId as Id<"recurringEvents">)
      : undefined,
    isRecurringInstance:
      typeof tw.isRecurringInstance === "boolean"
        ? tw.isRecurringInstance
        : undefined,
  };
}

/* ────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────────────────── */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => Number(n));
  return (h || 0) * 60 + (m || 0);
}

/** Calendar column Y position: derive minutes on the GRID timezone axis from UTC instant when possible. */
export function eventGridStartMinutes(
  w: {
    startTimeHHMM: string;
    startTimeEpochMs?: number;
    startDayYYYYMMDD: string;
    timeZone: string;
  },
  gridTimeZone: string,
): number {
  const gridTz = gridTimeZone.trim() || "UTC";
  const rowTz = (typeof w.timeZone === "string" ? w.timeZone : "").trim() || "UTC";

  if (
    typeof w.startTimeEpochMs === "number" &&
    Number.isFinite(w.startTimeEpochMs)
  ) {
    const wall = wallClockInTimeZone(w.startTimeEpochMs, gridTz);
    return hhmmToMinutes(wall.startTimeHHMM);
  }

  if (rowTz === gridTz) {
    return hhmmToMinutes(w.startTimeHHMM);
  }

  if (!/^\d{8}$/.test(w.startDayYYYYMMDD)) {
    return hhmmToMinutes(w.startTimeHHMM);
  }

  try {
    const epochMs = cachedWallClockGridToEpochMs(
      w.startDayYYYYMMDD,
      hhmmToMinutes(w.startTimeHHMM),
      rowTz,
    );
    const wall = wallClockInTimeZone(epochMs, gridTz);
    return hhmmToMinutes(wall.startTimeHHMM);
  } catch {
    return hhmmToMinutes(w.startTimeHHMM);
  }
}

export function minutesToHHMM(min: number): string {
  const safe = Math.max(0, Math.min(DAY_MINUTES - 1, Math.round(min)));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function snapMinutes(min: number): number {
  return Math.round(min / SNAP_MINUTES) * SNAP_MINUTES;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Nearest scrollable ancestor (vertical); used to keep drag previews in sync when the wheel scrolls. */
export function findVerticalScrollHost(from: HTMLElement | null): HTMLElement | null {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    !from
  ) {
    return null;
  }
  let el: HTMLElement | null = from;
  while (el) {
    if (el === document.documentElement || el === document.body) {
      el = el.parentElement;
      continue;
    }
    const style = window.getComputedStyle(el);
    const oy = style.overflowY;
    if (
      (oy === "auto" || oy === "scroll" || oy === "overlay") &&
      el.scrollHeight > el.clientHeight + 1
    ) {
      return el;
    }
    el = el.parentElement;
  }
  return null;
}

export function formatClockTime(absMinutes: number): string {
  const safe = ((Math.round(absMinutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hour = Math.floor(safe / 60);
  const minute = safe % 60;
  const period = hour < 12 ? "AM" : "PM";
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const mm = String(minute).padStart(2, "0");
  return `${displayHour}:${mm} ${period}`;
}

export function withAlpha(hex: string, alphaHex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
  return `${hex}${alphaHex}`;
}

/* ────────────────────────────────────────────────────────────────────────
 *  Adaptive event-content tier — productivity-one parity for short blocks.
 *
 *  Title is the single piece of content the user actually needs at every
 *  size. P1 lets FullCalendar prioritise the title and only adds time +
 *  duration + badges when there's vertical room. We do the same with
 *  explicit tiers + per-tier padding so even a 30-minute block (scaled by
 *  `PX_PER_MINUTE`) still has room for its title.
 *  always shows its name. Critical: the previous tiering reserved 6px
 *  top + 6px bottom for resize handles AND tried to fit title + time at
 *  medium, which left 0 px of usable vertical room → blank tile. The
 *  new tiers shrink handles + drop the time row earlier.
 *
 *  Tiers (outer height in px; duration in minutes × PX_PER_MINUTE before the
 *  display minimum — see `eventBlockHeightPx`):
 *
 *    mini   ( <14): truncated title, 9 px font,    handles=0, pad=1
 *    small  (14-29): title only,    11 px font,    handles=0, pad=2
 *    medium (30-49): title only,    12 px font,    handles=4, pad=0
 *    large  ( ≥50): title + time,   13/11 px,      handles=6, pad=0
 *                   + duration + budget/live badge at ≥ HOUR_HEIGHT
 *
 *  Title is rendered at every tier with `numberOfLines={1}` so long
 *  names ellipsize instead of disappearing.
 * ──────────────────────────────────────────────────────────────────────── */
export type EventSizeTier = "mini" | "small" | "medium" | "large";

export interface TierLayout {
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

export function pickTierLayout(height: number): TierLayout {
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
    // they don't push the title out (one hour tall at the current scale).
    showDuration: height >= HOUR_HEIGHT,
    showBadges: height >= HOUR_HEIGHT,
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
export interface EventLayout {
  /** 0-indexed lane within the event's overlap group. */
  lane: number;
  /** Total lanes occupied during this event's span. */
  laneCount: number;
}

export function packOverlappingEvents(
  windows: TimeWindowDoc[],
  gridTimeZone: string,
): Map<string, EventLayout> {
  const items = windows.map((w) => {
    const start = eventGridStartMinutes(w, gridTimeZone);
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
