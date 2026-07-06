import { useEffect, useMemo, useRef } from "react";
import { Platform } from "react-native";
import { Gesture } from "react-native-gesture-handler";

/**
 * Native-only gesture wiring for `CalendarEventBlock`. On mobile-web the
 * existing `onPointerDown` path (pointer events + `window.pointermove`)
 * already works because React Native Web translates touch → pointer
 * events. On native iOS / Android those DOM-flavoured APIs don't exist,
 * so we substitute `react-native-gesture-handler` gestures here.
 *
 * Interaction model (mirrors Apple Calendar / Google Calendar mobile):
 *
 *   • Tap the event body               → open EventDialog
 *   • Long-press (≈220ms) on the body  → enter "edit mode" for that
 *                                        event; visible drag handles
 *                                        appear at top and bottom. If
 *                                        the user keeps dragging past
 *                                        the long-press, the same
 *                                        gesture moves the event.
 *   • In edit mode, drag top handle    → resize from the top edge
 *   • In edit mode, drag bot. handle   → resize from the bottom edge
 *
 * Handle gestures are always defined, but the handle Views themselves
 * only render while `isSelected` is true — so gesture-handler only
 * attaches the handle gestures when the user is in edit mode. Handle
 * activation uses a very short `activateAfterLongPress` so a fast
 * scroll still wins, but a deliberate touch feels immediate.
 *
 * IMPORTANT: The gesture objects returned here are stable across
 * re-renders — we deliberately avoid putting `isSelected` (or any
 * frequently-changing value) in the `useMemo` deps. Recreating the
 * gesture object while a gesture is in flight tears down the native
 * handler before its `onEnd` / `onFinalize` callbacks have run, which
 * manifested as "resize snaps back to the original size right after
 * release". All state changes plumb through refs instead.
 */

interface UseNativeGesturesInput {
  /** Initial start-minute of the event (grid-local). Read at `onBegin`. */
  baseStartRef: React.MutableRefObject<number>;
  /** Initial duration-minute of the event. Read at `onBegin`. */
  baseDurationRef: React.MutableRefObject<number>;
  /** Whether native gestures should be attached at all. */
  enabled: boolean;
  /** px → min factor (matches the calendar grid). */
  pxPerMinute: number;
  /** Snap grid, e.g. 5 minutes. */
  snapMinutes: number;
  /** Total day length, 24 * 60. */
  dayMinutes: number;
  /** Min event duration (5 min). */
  minDurationMinutes: number;

  /** Live drag preview — pass `null` to clear. */
  onDraftChange: (draft: { start: number; duration: number } | null) => void;
  /** Called on tap (no movement). */
  onEditRequest: () => void;
  /** Called when the body long-press activates — enters edit mode. */
  onSelect: () => void;
  /** Called after any successful commit (move or resize). */
  onCommit: (startMinutes: number, durationMinutes: number) => void;
}

interface UseNativeGesturesResult {
  /** Race of tap + long-press-pan. Attach to the event body on native. */
  bodyGesture: ReturnType<typeof Gesture.Race> | null;
  /** Short-hold Pan on the top handle (visible only when selected). */
  topHandleGesture: ReturnType<typeof Gesture.Pan> | null;
  /** Short-hold Pan on the bottom handle (visible only when selected). */
  bottomHandleGesture: ReturnType<typeof Gesture.Pan> | null;
}

const BODY_LONG_PRESS_MS = 220;
// Short hold on the handles. Long enough to reject a scroll gesture
// (which moves within a few ms), short enough to feel immediate once
// the user has already committed to editing by long-pressing.
const HANDLE_ACTIVATE_MS = 90;

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function useCalendarEventNativeGestures({
  baseStartRef,
  baseDurationRef,
  enabled,
  pxPerMinute,
  snapMinutes,
  dayMinutes,
  minDurationMinutes,
  onDraftChange,
  onEditRequest,
  onSelect,
  onCommit,
}: UseNativeGesturesInput): UseNativeGesturesResult {
  // Latest-callback refs so the gesture closures always call the freshest
  // React state setters / prop callbacks without needing to be
  // re-created (which would destroy an in-flight gesture).
  const onDraftChangeRef = useRef(onDraftChange);
  const onEditRequestRef = useRef(onEditRequest);
  const onSelectRef = useRef(onSelect);
  const onCommitRef = useRef(onCommit);
  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);
  useEffect(() => {
    onEditRequestRef.current = onEditRequest;
  }, [onEditRequest]);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Snapshot at gesture start so pan deltas stack against the pre-drag
  // window. Refs (not state) — never trigger renders, never invalidate
  // gestures.
  const anchor = useRef<{ start: number; duration: number } | null>(null);
  const gestureMoved = useRef(false);
  const lastBodyDraft = useRef<{ start: number; duration: number } | null>(
    null,
  );
  const lastTopDraft = useRef<{ start: number; duration: number } | null>(
    null,
  );
  const lastBottomDraft = useRef<{ start: number; duration: number } | null>(
    null,
  );

  const snap = (min: number) => Math.round(min / snapMinutes) * snapMinutes;

  return useMemo(() => {
    if (!enabled || Platform.OS === "web") {
      return {
        bodyGesture: null,
        topHandleGesture: null,
        bottomHandleGesture: null,
      };
    }

    /* ── Body: tap ⊕ (long-press then pan for move). ─────────────── */
    // `.runOnJS(true)` on every gesture — when `react-native-reanimated`
    // is installed (which it is here) gesture-handler auto-workletizes
    // callbacks and runs them on the UI thread by default. Our callbacks
    // touch React state / mutations and must run on the JS thread.
    const tap = Gesture.Tap()
      .runOnJS(true)
      .maxDuration(500)
      .maxDistance(10)
      .onEnd((_e, success) => {
        if (success) onEditRequestRef.current();
      });

    const bodyPan = Gesture.Pan()
      .runOnJS(true)
      // Requires the finger to sit still for BODY_LONG_PRESS_MS before
      // pan starts — matches iOS Calendar's "lift-then-drag" feel and
      // prevents scroll gestures from activating a drag.
      .activateAfterLongPress(BODY_LONG_PRESS_MS)
      .onStart(() => {
        // Long-press fired → the user has entered "edit mode" for this
        // event. Notify the parent so it can flip `isSelected` (which
        // in turn renders visible handles). Firing here (not `onBegin`)
        // waits until the long-press has actually been confirmed.
        onSelectRef.current();
      })
      .onBegin(() => {
        anchor.current = {
          start: baseStartRef.current,
          duration: baseDurationRef.current,
        };
        gestureMoved.current = false;
        lastBodyDraft.current = null;
      })
      .onUpdate((e) => {
        const a = anchor.current;
        if (!a) return;
        const deltaMin = snap(e.translationY / pxPerMinute);
        const newStart = clamp(
          a.start + deltaMin,
          0,
          dayMinutes - a.duration,
        );
        if (newStart !== a.start) gestureMoved.current = true;
        const d = { start: newStart, duration: a.duration };
        lastBodyDraft.current = d;
        onDraftChangeRef.current(d);
      })
      .onEnd(() => {
        const a = anchor.current;
        const d = lastBodyDraft.current;
        anchor.current = null;
        lastBodyDraft.current = null;
        // Clear the live draft FIRST so `isInteracting` (which is
        // `draft !== null`) flips to `false` in the same batched
        // render as the `setPendingCommit` below. If we leave this
        // for `onFinalize`, and gesture-handler happens to drop
        // that callback (unmount races, orphaned handlers after a
        // parent re-render, etc.), the tile stays in "interacting"
        // mode and the render swaps the title out for a
        // time-window text that then also gets clipped — which
        // reads as "title and times disappear".
        onDraftChangeRef.current(null);
        if (a && d && gestureMoved.current) {
          onCommitRef.current(d.start, d.duration);
        }
      })
      .onFinalize(() => {
        // Safety net — always clear, harmless if already null.
        onDraftChangeRef.current(null);
      });

    const bodyGesture = Gesture.Race(tap, bodyPan);

    /* ── Top handle resize. ──────────────────────────────────────── */
    const topHandleGesture = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(HANDLE_ACTIVATE_MS)
      .onBegin(() => {
        anchor.current = {
          start: baseStartRef.current,
          duration: baseDurationRef.current,
        };
        gestureMoved.current = false;
        lastTopDraft.current = null;
      })
      .onUpdate((e) => {
        const a = anchor.current;
        if (!a) return;
        const initialEnd = a.start + a.duration;
        const deltaMin = snap(e.translationY / pxPerMinute);
        const newStart = clamp(
          a.start + deltaMin,
          0,
          initialEnd - minDurationMinutes,
        );
        if (newStart !== a.start) gestureMoved.current = true;
        const d = { start: newStart, duration: initialEnd - newStart };
        lastTopDraft.current = d;
        onDraftChangeRef.current(d);
      })
      .onEnd(() => {
        const a = anchor.current;
        const d = lastTopDraft.current;
        anchor.current = null;
        lastTopDraft.current = null;
        onDraftChangeRef.current(null);
        if (a && d && gestureMoved.current) {
          onCommitRef.current(d.start, d.duration);
        }
      })
      .onFinalize(() => {
        onDraftChangeRef.current(null);
      });

    /* ── Bottom handle resize. ────────────────────────────────────── */
    const bottomHandleGesture = Gesture.Pan()
      .runOnJS(true)
      .activateAfterLongPress(HANDLE_ACTIVATE_MS)
      .onBegin(() => {
        anchor.current = {
          start: baseStartRef.current,
          duration: baseDurationRef.current,
        };
        gestureMoved.current = false;
        lastBottomDraft.current = null;
      })
      .onUpdate((e) => {
        const a = anchor.current;
        if (!a) return;
        const deltaMin = snap(e.translationY / pxPerMinute);
        const newDuration = clamp(
          a.duration + deltaMin,
          minDurationMinutes,
          dayMinutes - a.start,
        );
        if (newDuration !== a.duration) gestureMoved.current = true;
        const d = { start: a.start, duration: newDuration };
        lastBottomDraft.current = d;
        onDraftChangeRef.current(d);
      })
      .onEnd(() => {
        const a = anchor.current;
        const d = lastBottomDraft.current;
        anchor.current = null;
        lastBottomDraft.current = null;
        onDraftChangeRef.current(null);
        if (a && d && gestureMoved.current) {
          onCommitRef.current(d.start, d.duration);
        }
      })
      .onFinalize(() => {
        onDraftChangeRef.current(null);
      });

    return { bodyGesture, topHandleGesture, bottomHandleGesture };
    // Only stable primitives in the dep array — no callbacks, no
    // `isSelected`. This is deliberate: see the module-level comment
    // about gesture stability.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    pxPerMinute,
    snapMinutes,
    dayMinutes,
    minDurationMinutes,
  ]);
}
