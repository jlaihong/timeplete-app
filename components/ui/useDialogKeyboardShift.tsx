/**
 * Native keyboard avoidance for dialog cards — the pattern extracted from
 * `EventDialog` after it was debugged on-device (see that file's history).
 *
 * Problem: on iOS/Android the window does NOT resize when the soft keyboard
 * opens (react-native-keyboard-controller keeps the window full-size), so a
 * dialog card anchored to the bottom of its overlay keeps its footer
 * (Cancel / Save / Delete) hidden behind the keyboard + the app-wide
 * KeyboardToolbar. `KeyboardAwareScrollView` only rescues content INSIDE the
 * scroll view — the footer sits outside it.
 *
 * Solution: lift the card with a `marginBottom` equal to how far the
 * keyboard (+ toolbar + gap) intrudes past the overlay's bottom edge, and
 * cap the card's height so its top stays below the status bar.
 *
 * Pitfalls this implementation avoids (each one was a real on-device bug):
 *  - Raw keyboard height over-shifts: overlays are often mounted inside a
 *    tab screen whose bottom edge already sits a tab-bar's-height above the
 *    physical screen bottom. We measure the anchor's real distance from the
 *    window bottom and subtract it.
 *  - `transform: translateY` breaks Android hit-testing (touch bounds stay
 *    at the untransformed position) — scrolling/taps die. `marginBottom`
 *    shifts real layout bounds.
 *  - `measureInWindow` is relative to the app window (below the status bar)
 *    on some Androids while `useWindowDimensions().height` spans the full
 *    screen — overstating the gap by `insets.top` and leaving the footer
 *    under the keyboard toolbar. `measure()`'s `pageY` is screen-absolute.
 *  - Percentage `maxHeight` can't resolve against the content-sized anchor
 *    wrappers, so the cap must be a pixel value.
 *
 * Web needs none of this — overlays there track `visualViewport.height`,
 * which shrinks with the keyboard.
 */
import React, { useCallback, useRef, useState } from "react";
import { Platform, useWindowDimensions, View } from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Height of the app-wide `KeyboardToolbar` (react-native-keyboard-controller). */
const KEYBOARD_TOOLBAR_HEIGHT = 42;
/** Breathing room between the card bottom and the keyboard toolbar. */
const KEYBOARD_GAP = 8;

export interface DialogKeyboardShift {
  /**
   * Attach to the OVERLAY root View (the absolute-filled backdrop
   * container), NOT the card/anchor: the overlay's geometry is stable
   * across keyboard visibility and align changes, while a card anchor
   * moves when a centered dialog docks to the bottom — measuring the
   * anchor gave a stale (centered) gap and left the lift short.
   */
  overlayRef: React.RefObject<View | null>;
  /** Attach as `onLayout` of the overlay root. */
  measureOverlay: () => void;
  /** Apply as `marginBottom` on an inner wrapper around the card. */
  keyboardShift: number;
  /**
   * Pixel height cap for the card (undefined on web — web dialogs keep
   * their own percentage-based caps).
   */
  cardMaxHeight: number | undefined;
}

export function useDialogKeyboardShift(): DialogKeyboardShift {
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((s) => (s.isVisible ? s.height : 0));

  // Overlay geometry relative to the window. The overlay may be mounted
  // anywhere — below a navigation header, inside a padded page container,
  // above a tab bar — so BOTH edges matter:
  //  - bottom gap feeds the lift (don't over-shift past what the overlay
  //    is already elevated by),
  //  - top offset feeds the height cap (a card capped against the full
  //    window would overflow the shifted wrapper and poke back under the
  //    keyboard — seen with the Track dialogs, whose overlay sits inside
  //    a padded trackables page 129dp below the window top).
  // The overlay is absolute-filled, so these never change with keyboard
  // or card layout — no measurement feedback loop.
  const [overlayFrame, setOverlayFrame] = useState<{
    top: number;
    bottomGap: number;
  } | null>(null);
  const overlayRef = useRef<View>(null);
  const measureOverlay = useCallback(() => {
    // measure() (pageY) rather than measureInWindow(): on some Android
    // devices measureInWindow's y is relative to the app window below the
    // status bar while useWindowDimensions().height spans the full screen,
    // which would overstate the gap by insets.top and leave the footer
    // buttons hidden under the keyboard toolbar.
    overlayRef.current?.measure((_x, _y, _w, h, _pageX, pageY) => {
      if (typeof pageY !== "number" || typeof h !== "number") return;
      setOverlayFrame({
        top: pageY,
        bottomGap: Math.max(0, windowHeight - (pageY + h)),
      });
    });
  }, [windowHeight]);

  const overlayBottomGap = overlayFrame?.bottomGap ?? 0;
  // Until measured, assume the overlay starts below the status bar.
  const overlayTop = overlayFrame?.top ?? insets.top;

  const keyboardShift =
    Platform.OS === "web" || keyboardHeight === 0
      ? 0
      : Math.max(
          0,
          keyboardHeight +
            KEYBOARD_TOOLBAR_HEIGHT +
            KEYBOARD_GAP -
            overlayBottomGap,
        );

  // Height cap for the card. Two ceilings apply:
  //  - the card's top must stay below the status bar (insets.top) AND
  //    below the overlay's own top edge (the overlay might start below a
  //    navigation header / page padding — the card can't render above it),
  //  - with the keyboard open, cap + shift must fit within the overlay,
  //    otherwise the anchor overflows and the card slides back under the
  //    keyboard instead of lifting.
  const cardTopLimit = Math.max(insets.top, overlayTop);
  const overlayHeight = windowHeight - overlayTop - overlayBottomGap;
  const cardMaxHeight =
    Platform.OS === "web"
      ? undefined
      : keyboardHeight > 0
        ? windowHeight -
          keyboardHeight -
          KEYBOARD_TOOLBAR_HEIGHT -
          KEYBOARD_GAP -
          cardTopLimit
        : Math.min(windowHeight * 0.92, overlayHeight);

  return { overlayRef, measureOverlay, keyboardShift, cardMaxHeight };
}

/** Pixel max-height for `DialogCard`s rendered inside a `DialogOverlay`. */
export const DialogMaxHeightContext = React.createContext<number | undefined>(
  undefined,
);
