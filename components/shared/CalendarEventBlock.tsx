import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Colors } from "../../constants/colors";
import { formatSecondsAsHM } from "../../lib/dates";
import { DEFAULT_EVENT_COLOR } from "../../lib/eventColors";
import { wallClockInTimeZone } from "../../lib/wallClockTimeZone";
import { useCalendarEventNativeGestures } from "./CalendarEventNativeGestures";
import {
  DAY_MINUTES,
  EventInteractionMode,
  EventLayout,
  MIN_DRAG_MIDDLE_BAND_PX,
  MIN_DURATION_MINUTES,
  PX_PER_MINUTE,
  RESIZE_EDGE_HIT_MIN_PX,
  SNAP_MINUTES,
  TimeWindowDoc,
  clamp,
  eventBlockHeightPx,
  eventGridStartMinutes,
  findVerticalScrollHost,
  formatClockTime,
  hhmmToMinutes,
  isWeb,
  pickTierLayout,
  snapMinutes,
  withAlpha,
} from "./CalendarViewShared";
import { calendarViewStyles as styles } from "./CalendarViewStyles";

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
 *  Hit areas:
 *    Top / bottom strips (`resizeEdgeHitZone`) are `position:absolute` with a
 *    higher z-index than the body so `ns-resize` wins over `grab` on hover.
 *    Strip height uses `RESIZE_EDGE_HIT_MIN_PX` and caps per side so at least
 *    `MIN_DRAG_MIDDLE_BAND_PX` remains for move/drag (grab cursor).
 * ──────────────────────────────────────────────────────────────────────── */
interface CalendarEventBlockProps {
  tw: TimeWindowDoc;
  /** Matches `CalendarView`'s hourly grid (`Intl` or timer row). */
  gridTimeZone: string;
  /** Lane assignment from `packOverlappingEvents`. */
  layout: EventLayout;
  /** Notify parent to persist start/duration changes. */
  onCommit: (
    id: string,
    startMinutes: number,
    durationMinutes: number
  ) => void | Promise<void>;
  /**
   * Notify parent that the user clicked the event without dragging or
   * resizing. Used to open the edit dialog. Omitted for the live timer
   * pseudo-event.
   */
  onEditRequest?: () => void;
  /**
   * Native "edit mode" flag — when true, visible drag handles are
   * rendered at the top and bottom of the tile and handle gestures
   * activate immediately (no long-press needed).
   */
  isSelected?: boolean;
  /** Enter edit mode. Fired when a native long-press activates. */
  onSelect?: (id: string) => void;
  /** Exit edit mode. Fired on tap or after a native commit. */
  onDeselect?: () => void;
}

export function CalendarEventBlock({
  tw,
  gridTimeZone,
  layout,
  onCommit,
  onEditRequest,
  isSelected = false,
  onSelect,
  onDeselect,
}: CalendarEventBlockProps) {
  const baseStart = useMemo(
    () => eventGridStartMinutes(tw, gridTimeZone),
    [
      gridTimeZone,
      tw.startTimeEpochMs,
      tw.startTimeHHMM,
      tw.startDayYYYYMMDD,
      tw.timeZone,
    ],
  );
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
    if (!pendingCommit) return;
    if (tw.isLive) {
      if (Math.abs(pendingCommit.start - baseStart) <= SNAP_MINUTES + 1) {
        setPendingCommit(null);
      }
      return;
    }
    if (
      pendingCommit.start === baseStart &&
      pendingCommit.duration === baseDuration
    ) {
      setPendingCommit(null);
    }
  }, [baseStart, baseDuration, pendingCommit, tw.isLive]);

  /**
   * Tag the rendered DOM node with `data-calendar-event-id` so the
   * document-level `contextmenu` listener in `CalendarView` can map a
   * right-click back to the event without per-block listeners (which
   * proved unreliable on macOS / RN-Web).
   */
  const eventBlockRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!isWeb) return;
    const node = eventBlockRef.current;
    if (!node || tw.isLive) return;
    node.setAttribute("data-calendar-event-id", String(tw._id));
    return () => node.removeAttribute("data-calendar-event-id");
  }, [tw._id, tw.isLive]);

  const renderStart = draft?.start ?? pendingCommit?.start ?? baseStart;
  const renderDuration = draft?.duration ?? pendingCommit?.duration ?? baseDuration;
  const top = renderStart * PX_PER_MINUTE;
  const height = eventBlockHeightPx(renderDuration);

  const isLive = !!tw.isLive;
  // Web = pointer events on invisible edge strips (existing). Native =
  // gesture-handler with visible drag handles that appear only when the
  // event is in "edit mode" (`isSelected`). `canDragBody` still gates
  // the web-only "grab" cursor + `onPointerDown` handlers below.
  const canDragBody = isWeb && !isLive;
  const allowLiveTopResize = isWeb && isLive;
  const showNativeHandles = !isWeb && !isLive && isSelected;

  const tierLayout = pickTierLayout(height);
  const tierHandlePx = tierLayout.handlePx;

  const maxResizeEdgePx =
    canDragBody && height > 4
      ? Math.max(
          1,
          Math.min(
            Math.floor((height - MIN_DRAG_MIDDLE_BAND_PX) / 2),
            Math.floor(height / 2) - 1
          )
        )
      : 0;

  const resizeHitPxBoth =
    canDragBody && maxResizeEdgePx > 0
      ? Math.min(
          Math.max(tierHandlePx, RESIZE_EDGE_HIT_MIN_PX),
          maxResizeEdgePx
        )
      : 0;

  // Fixed visible-handle height on native. Capped for short events so
  // the body still has a usable middle band. 14 px is a comfortable
  // finger target on iOS while remaining unobtrusive.
  const NATIVE_HANDLE_PX = 14;
  const nativeHandleHeightPx = showNativeHandles && height > 4
    ? Math.min(NATIVE_HANDLE_PX, Math.max(4, Math.floor((height - 6) / 2)))
    : 0;

  const liveTopHitPx =
    allowLiveTopResize && height > 4
      ? Math.min(
          RESIZE_EDGE_HIT_MIN_PX,
          Math.max(1, height - 4)
        )
      : 0;

  const resizeHitPxTop = allowLiveTopResize ? liveTopHitPx : resizeHitPxBoth;
  const resizeHitPxBottom = allowLiveTopResize ? 0 : resizeHitPxBoth;

  const startInteraction = useCallback(
    (mode: EventInteractionMode, ev: any) => {
      // Only react to the primary (left) button. Without this guard a
      // right-click — which on macOS includes a two-finger trackpad
      // tap — would call preventDefault on `pointerdown`, which most
      // browsers treat as a signal to suppress the follow-up
      // `contextmenu` event. That breaks the right-click delete menu
      // on `eventBlock`.
      const button: number | undefined = ev?.button ?? ev?.nativeEvent?.button;
      if (typeof button === "number" && button !== 0) return;

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
      // Anchor on the on-screen position. After a prior drop, `pendingCommit`
      // holds the new slot until the query refetch updates `baseStart`; using
      // `baseStart` alone makes the second drag jump back to the old time.
      const initialStart = pendingCommit?.start ?? baseStart;
      const initialDuration = pendingCommit?.duration ?? baseDuration;
      const initialEnd = initialStart + initialDuration;

      const gridEl =
        (typeof ev?.currentTarget === "object" &&
          ev?.currentTarget &&
          "closest" in ev.currentTarget &&
          (ev.currentTarget as HTMLElement).closest?.(
            "[data-calendar-grid='1']"
          )) ||
        eventBlockRef.current?.closest?.("[data-calendar-grid='1']") ||
        null;

      let initialGridMinuteFloat = 0;
      if (gridEl) {
        const rect0 = gridEl.getBoundingClientRect();
        initialGridMinuteFloat = (startY - rect0.top) / PX_PER_MINUTE;
      }

      const minuteDeltaFromClientY = (clientY: number): number => {
        if (!gridEl) {
          return snapMinutes((clientY - startY) / PX_PER_MINUTE);
        }
        const rect = gridEl.getBoundingClientRect();
        const currentGridMinute = (clientY - rect.top) / PX_PER_MINUTE;
        return snapMinutes(currentGridMinute - initialGridMinuteFloat);
      };

      const compute = (clientY: number) => {
        const deltaMin = minuteDeltaFromClientY(clientY);
        if (mode === "drag") {
          const newStart = clamp(
            initialStart + deltaMin,
            0,
            DAY_MINUTES - initialDuration
          );
          return { start: newStart, duration: initialDuration };
        }
        if (mode === "resize-top") {
          if (tw.isLive) {
            const wallNow = wallClockInTimeZone(Date.now(), gridTimeZone);
            const nowMin =
              wallNow.startDayYYYYMMDD === tw.startDayYYYYMMDD
                ? hhmmToMinutes(wallNow.startTimeHHMM)
                : 0;
            const maxStart = Math.max(
              0,
              Math.floor((nowMin - MIN_DURATION_MINUTES) / SNAP_MINUTES) *
                SNAP_MINUTES
            );
            const newStart = clamp(
              snapMinutes(initialStart + deltaMin),
              0,
              maxStart
            );
            const newDuration = Math.max(
              MIN_DURATION_MINUTES,
              Math.round(nowMin - newStart)
            );
            return { start: newStart, duration: newDuration };
          }
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

      // Track whether the pointer moved past a small threshold during
      // the gesture. A pointerup with no real movement is interpreted
      // as a click and (in "drag" mode) opens the edit dialog. We use
      // a raw-pixel threshold rather than the snapped-minute delta so
      // even sub-snap-grid jitter still counts as a click.
      const CLICK_MOVE_THRESHOLD_PX = 4;
      let movedPx = 0;
      let lastPointerY = startY;
      let gestureMoved = false;

      const scrollHost =
        isWeb && typeof document !== "undefined" && gridEl
          ? findVerticalScrollHost(gridEl)
          : null;

      const markGestureIfChanged = (d: { start: number; duration: number }) => {
        if (
          d.start !== initialStart ||
          d.duration !== initialDuration
        ) {
          gestureMoved = true;
        }
      };

      const onMove = (e: PointerEvent) => {
        lastPointerY = e.clientY;
        const dy = Math.abs(e.clientY - startY);
        if (dy > movedPx) movedPx = dy;
        const d = compute(e.clientY);
        markGestureIfChanged(d);
        setDraft(d);
      };

      const onScroll = () => {
        const d = compute(lastPointerY);
        markGestureIfChanged(d);
        setDraft(d);
      };

      const onUp = (e: PointerEvent) => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        if (scrollHost) {
          scrollHost.removeEventListener("scroll", onScroll);
        }
        const finalDraft = compute(e.clientY);
        const wasClick =
          mode === "drag" &&
          movedPx < CLICK_MOVE_THRESHOLD_PX &&
          !gestureMoved;
        setDraft(null);
        if (wasClick) {
          // Clean click on the event body — open edit dialog.
          if (onEditRequest) onEditRequest();
          return;
        }
        const durationChanged =
          finalDraft.duration !== initialDuration;
        const startChanged = finalDraft.start !== initialStart;
        const shouldCommit = tw.isLive
          ? mode === "resize-top" && startChanged
          : startChanged || durationChanged;
        if (shouldCommit) {
          setPendingCommit(finalDraft);
          void Promise.resolve(
            onCommit(tw._id, finalDraft.start, finalDraft.duration)
          ).catch(() => {
            setPendingCommit(null);
          });
        }
      };

      scrollHost?.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [baseStart, baseDuration, pendingCommit, onCommit, onEditRequest, tw._id, tw.isLive, tw.startDayYYYYMMDD, gridTimeZone]
  );

  // ── Native gesture wiring (iOS / Android). On mobile-web the pointer
  // handlers above already work. Native has no PointerEvent so we
  // substitute react-native-gesture-handler gestures. Refs keep the
  // gesture callbacks stable across re-renders while still tracking
  // the on-screen position (pendingCommit until the server catches up).
  // See `CalendarEventNativeGestures.tsx` for the interaction model.
  const baseStartRef = useRef(pendingCommit?.start ?? baseStart);
  const baseDurationRef = useRef(pendingCommit?.duration ?? baseDuration);
  useEffect(() => {
    baseStartRef.current = pendingCommit?.start ?? baseStart;
  }, [baseStart, pendingCommit?.start]);
  useEffect(() => {
    baseDurationRef.current = pendingCommit?.duration ?? baseDuration;
  }, [baseDuration, pendingCommit?.duration]);

  const handleNativeDraftChange = useCallback(
    (d: { start: number; duration: number } | null) => {
      setDraft(d);
    },
    [],
  );
  const handleNativeCommit = useCallback(
    (start: number, duration: number) => {
      setPendingCommit({ start, duration });
      void Promise.resolve(onCommit(tw._id, start, duration)).catch(() => {
        setPendingCommit(null);
      });
      // Exit edit mode after a successful move / resize so the handles
      // hide and the calendar returns to its "clean" state. Users can
      // re-enter edit mode by long-pressing again.
      onDeselect?.();
    },
    [onCommit, onDeselect, tw._id],
  );
  const handleNativeEditRequest = useCallback(() => {
    // Tapping the event opens the dialog and also exits edit mode —
    // gives the user a way out of the selected state without needing
    // to hunt for empty calendar space.
    onDeselect?.();
    if (onEditRequest) onEditRequest();
  }, [onDeselect, onEditRequest]);
  const handleNativeSelect = useCallback(() => {
    if (onSelect) onSelect(tw._id);
  }, [onSelect, tw._id]);

  const {
    bodyGesture: nativeBodyGesture,
    topHandleGesture: nativeTopHandleGesture,
    bottomHandleGesture: nativeBottomHandleGesture,
  } = useCalendarEventNativeGestures({
    baseStartRef,
    baseDurationRef,
    // Live-timer resize is web-only for parity with the pointer path.
    enabled: !isWeb && !isLive,
    pxPerMinute: PX_PER_MINUTE,
    snapMinutes: SNAP_MINUTES,
    dayMinutes: DAY_MINUTES,
    minDurationMinutes: MIN_DURATION_MINUTES,
    onDraftChange: handleNativeDraftChange,
    onEditRequest: handleNativeEditRequest,
    onSelect: handleNativeSelect,
    onCommit: handleNativeCommit,
  });

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
  const bodyHandlers = canDragBody
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
            ...(isWeb ? { cursor: "default" as const } : {}),
            paddingTop: tierLayout.padTop,
            paddingBottom: tierLayout.padBottom,
            paddingHorizontal: tierLayout.padHorizontal,
          } as any,
        ],
      } as Record<string, unknown>);

  const topResizeProps =
    resizeHitPxTop > 0
      ? ({
          // `onPointerDown` is a no-op on native (View ignores unknown
          // props). Native uses the `nativeTopEdgeGesture` wrapper
          // below. Guarding `cursor` avoids the "unknown style key"
          // warning on iOS / Android where the CSS property doesn't
          // exist.
          ...(isWeb
            ? { onPointerDown: (e: any) => startInteraction("resize-top", e) }
            : {}),
          style: [
            styles.resizeEdgeHitZone,
            {
              height: resizeHitPxTop,
              top: 0,
              ...(isWeb ? { cursor: "ns-resize" as const } : {}),
            } as any,
          ],
        } as Record<string, unknown>)
      : null;
  const bottomResizeProps =
    resizeHitPxBottom > 0
      ? ({
          ...(isWeb
            ? { onPointerDown: (e: any) => startInteraction("resize-bottom", e) }
            : {}),
          style: [
            styles.resizeEdgeHitZone,
            {
              height: resizeHitPxBottom,
              bottom: 0,
              ...(isWeb ? { cursor: "ns-resize" as const } : {}),
            } as any,
          ],
        } as Record<string, unknown>)
      : null;

  // Use the server-computed displayTitle (explicit title → derived
  // name → fallback). Falls back here only for the live-timer
  // pseudo-event which doesn't go through the server query.
  const fallbackByType =
    tw.activityType === "EVENT"
      ? "Event"
      : tw.activityType === "TRACKABLE"
        ? "Trackable"
        : "Task";
  const displayTitle =
    (tw.displayTitle && tw.displayTitle.trim()) ||
    (tw.title && tw.title.trim()) ||
    (isLive ? "Timer" : fallbackByType);

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
      // Android/Fabric: force a real native view. The slot's `top` and
      // `height` change every frame during drag/resize; letting Fabric
      // flatten/unflatten "layout-only" views mid-interaction corrupts
      // the children's native layout (verified on-device: after a move,
      // the title/time Text nodes still exist in the uiautomator dump
      // but with inverted bounds, and never paint again).
      collapsable={false}
      style={[
        styles.eventSlot,
        {
          top,
          height,
          left: `${leftPercent}%` as unknown as number,
          width: `${colWidthPercent}%` as unknown as number,
          paddingLeft: slotPaddingLeft,
          paddingRight: slotPaddingRight,
          // Lift the tile above siblings while it's selected or being
          // dragged/resized. IMPORTANT (Android): the `zIndex` property
          // must ALWAYS be present with a numeric value — only its
          // VALUE may change. Adding/removing `zIndex` dynamically on
          // Android re-sorts the native child drawing order and can
          // permanently stop the view's children (title/time Text)
          // from being drawn, even though the view's own background
          // still renders. Previously the interaction zIndex was
          // toggled on the inner `eventBlock`, which triggered exactly
          // that bug after every move/resize.
          zIndex: showNativeHandles ? 12 : isInteracting ? 10 : 2,
        },
      ]}
      pointerEvents="box-none"
    >
      <View
        // RN-Web forwards `ref` through to the underlying <div>. We use
        // it to attach a native `contextmenu` listener (see effect above)
        // — the JSX `onContextMenu` prop is unreliable here.
        ref={(node: any) => {
          eventBlockRef.current = (node as HTMLElement | null) ?? null;
        }}
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
          // Visual hint that the tile is now in "edit mode" on native.
          // Slightly stronger outline so the handles at top/bottom read
          // as part of a distinct, focused element.
          showNativeHandles && styles.eventBlockSelected,
        ]}
      >
        <View
          // Android/Fabric: keep this wrapper as a real native view.
          // Without this it is "layout-only" (style-only View) and gets
          // flattened; its margins change when edit-mode handles
          // appear/disappear, and the flatten/unflatten transition is
          // what breaks the Text layout after a move/resize.
          collapsable={false}
          style={[
            {
              flex: 1,
              // Reserve space at top/bottom for either the web edge
              // hit strips OR the native visible drag handles (only
              // one of these is ever > 0 at a time).
              marginTop:
                (resizeHitPxTop > 0 ? resizeHitPxTop : 0) +
                (showNativeHandles ? nativeHandleHeightPx : 0),
              marginBottom:
                (resizeHitPxBottom > 0 ? resizeHitPxBottom : 0) +
                (showNativeHandles ? nativeHandleHeightPx : 0),
            },
            canDragBody
              ? ({
                  cursor: isInteracting ? "grabbing" : "grab",
                } as any)
              : null,
          ]}
        >
          <MaybeGestureDetector gesture={nativeBodyGesture}>
          <View {...bodyHandlers}>
          {/* Title is ALWAYS rendered — the tile's minimum guaranteed
              visible element. During an interaction (drag / resize) we
              additionally render the live start–end times underneath
              if there's room for the tier. This is more forgiving than
              the previous "swap title for times" approach: even if
              `isInteracting` ever got stuck `true` on native (e.g. a
              dropped gesture-handler callback), the user still sees
              the event's title. */}
          <Text
            style={[titleStyle, { color: Colors.text }]}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            {displayTitle}
          </Text>
          {(isInteracting || tierLayout.showTime) && (
            <Text
              style={[
                styles.eventTime,
                { color: isInteracting ? Colors.text : displayColor },
              ]}
              numberOfLines={1}
            >
              {formatClockTime(renderStart)} – {formatClockTime(renderStart + renderDuration)}
              {tierLayout.showDuration || (isInteracting && tierLayout.tier === "large") ? (
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
        </View>
        </MaybeGestureDetector>
        </View>
        {/* Web-only invisible pointer-hit strips. Rendered via the same
         * absolute positioning as the visible native handles below so
         * the layout math (`marginTop`/`marginBottom`) matches. */}
        {isWeb && topResizeProps && <View {...topResizeProps} />}
        {isWeb && bottomResizeProps && <View {...bottomResizeProps} />}
        {/* Native drag handles — appear only while the event is in
         * edit mode. The visible bar acts as a hit target for the
         * resize Pan gesture (attached via `<GestureDetector>`). */}
        {showNativeHandles && nativeHandleHeightPx > 0 && (
          <>
            <MaybeGestureDetector gesture={nativeTopHandleGesture}>
              <View
                style={[
                  styles.nativeResizeHandle,
                  { height: nativeHandleHeightPx, top: 0 },
                ]}
              >
                <View
                  style={[
                    styles.nativeResizeHandleGrip,
                    { backgroundColor: displayColor },
                  ]}
                />
              </View>
            </MaybeGestureDetector>
            <MaybeGestureDetector gesture={nativeBottomHandleGesture}>
              <View
                style={[
                  styles.nativeResizeHandle,
                  { height: nativeHandleHeightPx, bottom: 0 },
                ]}
              >
                <View
                  style={[
                    styles.nativeResizeHandleGrip,
                    { backgroundColor: displayColor },
                  ]}
                />
              </View>
            </MaybeGestureDetector>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Wraps children in `<GestureDetector>` when a native gesture is
 * supplied, otherwise renders them directly. Lets us keep a single
 * JSX tree that works on both web (no gestures) and native (gestures
 * attached to each hit surface).
 */
function MaybeGestureDetector({
  gesture,
  children,
}: {
  gesture:
    | ReturnType<typeof Gesture.Race>
    | ReturnType<typeof Gesture.Pan>
    | null;
  children: React.ReactElement;
}) {
  if (!gesture) return children;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}
