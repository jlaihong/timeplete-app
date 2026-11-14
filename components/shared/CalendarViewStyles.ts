import { Platform, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import {
  CURRENT_TIME_LINE_COLOR,
  HOUR_HEIGHT,
  HOUR_LABEL_WIDTH,
  withAlpha,
} from "./CalendarViewShared";

/* ────────────────────────────────────────────────────────────────────────
 *  Styles — shared across CalendarView, CalendarEventBlock,
 *  CalendarGridPieces, and CalendarContextMenu.
 * ──────────────────────────────────────────────────────────────────────── */
export const calendarViewStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 60,
  },
  sectionTitle: {
    fontSize: FontSize.title,
    fontWeight: "700",
    color: Colors.text,
  },
  // One row: the day (and its summary) on the left, navigation on the
  // right. Left-aligned so it lines up with the section title above it.
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 8,
    paddingTop: 4,
    paddingBottom: 12,
    gap: 2,
  },
  /** Without a section title above it, the row needs its own top room. */
  dayNavNoTitle: { paddingTop: 14 },
  dayHeading: { flex: 1, minWidth: 0, gap: 2 },
  dayLabel: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Colors.text,
  },
  summaryText: { fontSize: FontSize.caption, color: Colors.textTertiary },
  dayNavButton: {
    padding: 10,
    borderRadius: Radius.pill,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  todayButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 4,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  todayButtonText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  timeline: { flex: 1 },
  // Top padding leaves room for the "12 AM" label, which is centred on
  // the first hour line and so pokes above the grid.
  timelineContent: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 80 },

  // Timeline surface = labels column + grid column, side by side.
  timelineSurface: {
    flexDirection: "row",
    position: "relative",
  },
  /** Spans the schedule grid (excluding the hour gutter) at the current time. */
  nowLine: {
    position: "absolute",
    left: HOUR_LABEL_WIDTH,
    right: 0,
    height: 2,
    marginTop: -1,
    backgroundColor: CURRENT_TIME_LINE_COLOR,
    zIndex: 20,
  },
  /** Dot at the start of the now line, so it reads as a marker, not a rule. */
  nowDot: {
    position: "absolute",
    left: -4,
    top: -3,
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    backgroundColor: CURRENT_TIME_LINE_COLOR,
  },
  labelsColumn: { width: HOUR_LABEL_WIDTH },
  hourLabelRow: {
    height: HOUR_HEIGHT,
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingRight: 10,
  },
  // Centred on its hour line (half the line height pulled up), the way
  // every calendar labels a time axis.
  hourLabel: {
    fontSize: 11,
    lineHeight: 14,
    marginTop: -7,
    color: Colors.textTertiary,
  },

  gridColumn: {
    flex: 1,
    position: "relative",
  },
  hourSlot: { height: HOUR_HEIGHT, position: "relative" },
  hourSlotDropTarget: {
    backgroundColor: Colors.primary + "10",
  },
  hourLine: {
    height: 1,
    backgroundColor: Colors.borderLight,
  },
  /** Lighter mid-hour guide; no time label (hourly labels stay as-is). */
  halfHourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    top: HOUR_HEIGHT / 2,
    height: 1,
    backgroundColor: withAlpha(Colors.borderLight, "80"),
  },

  eventsLayer: {
    position: "absolute",
    top: 0,
    // The right gutter stays empty so there is always bare grid to drag
    // on to create an event, even on a full day.
    left: 4,
    right: 12,
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
    position: "relative",
    borderRadius: 6,
    // Android (Fabric): a clipping view whose bounds change every frame
    // during drag/resize permanently stops painting its Text children
    // after the gesture ends (views survive with correct bounds in the
    // uiautomator dump — they just never draw again). Verified on
    // device: with `hidden` the title/time vanish after every
    // move/resize; with `visible` they persist. Web keeps `hidden` for
    // rounded-corner clipping.
    overflow: Platform.OS === "web" ? "hidden" : "visible",
  },
  eventBlockLive: {
    // Accent outline + glow pulse (web), the same "live" colour the
    // ticking task row and timer banner use; fill and left stripe stay
    // normal event colours from `displayColor` / `secondaryColor`.
    ...Platform.select({
      web: {
        outlineStyle: "solid" as const,
        outlineWidth: 2,
        outlineOffset: 0,
        outlineColor: Colors.primary,
        animation: "calLiveTimerOutlinePulse 2.4s ease-in-out infinite",
      } as any,
      default: {
        // Native: soft ring without replacing the list/trackable stripe.
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.45,
        shadowRadius: 5,
      },
    }),
  },
  // NOTE: no `zIndex` here — interaction lift lives on the OUTER slot
  // (always-present numeric value). Toggling zIndex on this inner view
  // breaks child drawing order on Android (text stops rendering).
  eventBlockDragging: {
    ...Platform.select({
      web: {
        boxShadow: "0 4px 12px rgba(0,0,0,0.35)",
      } as any,
      default: {},
    }),
  },
  eventBody: {
    flex: 1,
    justifyContent: "flex-start",
    // `overflow: hidden` clips text on short tiles (web). On Android
    // (Fabric / New Architecture), a clipping ancestor whose bounds
    // change every frame during a drag/resize permanently stops the
    // Text children from being painted after the gesture ends (the
    // views survive — uiautomator still reports correct bounds — they
    // just never draw). Keeping overflow visible on native avoids the
    // bug; the parent `eventBlock` still rounds corners via its own
    // border radius and the title uses numberOfLines so nothing
    // meaningfully overflows in practice.
    overflow: Platform.OS === "web" ? "hidden" : "visible",
  },
  /** Invisible top/bottom layer: receives hover before `eventBody` so resize cursor wins. */
  resizeEdgeHitZone: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 3,
  },
  /**
   * Native "edit mode" visual polish. A subtle white outline signals
   * that the tile is focused / interactive; the pop is intentionally
   * gentle so it doesn't look like an error state.
   */
  // NOTE: no `zIndex` here — see `eventBlockDragging` note above.
  eventBlockSelected: {
    ...Platform.select({
      web: {},
      default: {
        borderWidth: 1,
        borderColor: Colors.white + "88",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.24,
        shadowRadius: 6,
      },
    }),
  },
  /**
   * Visible resize handle on native. Uses the event's `displayColor`
   * for the inner grip so the affordance reads as "part of this
   * event". The outer bar is transparent — the grip does the visual
   * lifting while the whole bar is the hit target.
   */
  // IMPORTANT (Android): NO `zIndex` on this style. The handles mount
  // and unmount dynamically (on select/deselect), and adding/removing
  // a zIndexed child corrupts the parent ViewGroup's custom child
  // drawing order on Android — after which the tile's title/time Text
  // silently stops being painted (the views still exist and are laid
  // out correctly, they just never draw). Verified on-device via
  // uiautomator: text nodes present at correct bounds but invisible.
  // The handles render after the body in JSX, so default order already
  // draws them on top.
  nativeResizeHandle: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  nativeResizeHandleGrip: {
    width: 36,
    height: 4,
    borderRadius: 2,
    opacity: 0.9,
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
    color: Colors.onPrimary,
    backgroundColor: Colors.primary,
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

  contextMenu: {
    minWidth: 160,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingVertical: 4,
    zIndex: 1000,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  contextMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  contextMenuItemText: { fontSize: 14, fontWeight: "500" },
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
