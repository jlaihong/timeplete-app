import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  dialogOverlayStyles,
  type DialogOverlayProps,
} from "./dialogOverlayShared";
import {
  DialogMaxHeightContext,
  useDialogKeyboardShift,
} from "./useDialogKeyboardShift";

export type { DialogOverlayProps } from "./dialogOverlayShared";

/**
 * Native (iOS / Android) dialog backdrop.
 *
 * Layout:
 *
 *   <View overlay>
 *     <Pressable absoluteFill />   ← backdrop, rendered FIRST (bottom of z)
 *     {children}                    ← card, rendered SECOND (on top of backdrop)
 *   </View>
 *
 * Why this instead of wrapping children in a Pressable:
 *
 *   The historical implementation wrapped `{children}` in a Pressable (or
 *   later, a View with `onStartShouldSetResponder`) so backdrop taps under
 *   the card wouldn't leak to `onBackdropPress`. But any responder-claiming
 *   ancestor competes with nested `<ScrollView>`s on Android: fast flicks
 *   still worked because ScrollView's move-slop threshold got exceeded
 *   quickly, but slow drags stayed under the threshold and the outer view
 *   held on to the responder — scroll never activated.
 *
 *   With the backdrop as a *sibling* (not an ancestor) of the card, RN's
 *   touch hit-test picks the topmost view under the finger. When the touch
 *   is on the card, RN walks the card's own ancestry chain looking for a
 *   responder — the backdrop Pressable is NOT in that chain (it's a
 *   sibling), so it can't steal the ScrollView's scroll gesture. When the
 *   touch is outside the card, the backdrop Pressable is the topmost view
 *   and claims the tap → `onBackdropPress` fires.
 *
 *   Touches on empty card space (padding / gaps between children) don't
 *   fall through to the backdrop either — RN's responder search is per-
 *   ancestry-chain, not per-z-order, so an unhandled touch is simply
 *   discarded rather than dispatched to a sibling below.
 */
export function DialogOverlay({
  children,
  onBackdropPress,
  align = "center",
  zIndex = 1000,
}: DialogOverlayProps) {
  // Lift the card above the soft keyboard (+ app-wide KeyboardToolbar).
  // See useDialogKeyboardShift for the full rationale and the Android
  // pitfalls (transform hit-testing, measureInWindow offsets, percentage
  // maxHeight) this specific structure avoids.
  const { overlayRef, measureOverlay, keyboardShift, cardMaxHeight } =
    useDialogKeyboardShift();

  // The shift math anchors the card to the overlay's bottom edge. A
  // *centered* card would only get half the lift (the margin grows the
  // anchor symmetrically around the centre), so while the keyboard is up
  // we dock centered dialogs to the bottom — the standard mobile pattern.
  const effectiveAlign = keyboardShift > 0 ? "bottom" : align;

  return (
    <View
      ref={overlayRef}
      onLayout={measureOverlay}
      collapsable={false}
      style={[
        dialogOverlayStyles.overlay,
        effectiveAlign === "center"
          ? dialogOverlayStyles.overlayCenter
          : dialogOverlayStyles.overlayBottom,
        { zIndex },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFillObject}
        onPress={onBackdropPress}
        accessibilityLabel="Close dialog"
        accessibilityRole="button"
      />
      <DialogMaxHeightContext.Provider value={cardMaxHeight}>
        {/* The lift MUST be layout-based (margin), not a `transform`:
         * Android only dispatches touches to children whose LAYOUT bounds
         * contain the touch point, so a translateY'd card keeps its touch
         * target at the untranslated position (scroll/taps would die).
         *
         * The wrapper always stretches to the overlay width (a percentage-
         * width card can't resolve against a shrink-wrapped parent); when
         * centered, the inner view centres the card horizontally instead
         * of the overlay's alignItems. */}
        <View collapsable={false} style={styles.anchor}>
          <View
            style={[
              { marginBottom: keyboardShift },
              effectiveAlign === "center" && styles.centerInner,
            ]}
          >
            {children}
          </View>
        </View>
      </DialogMaxHeightContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  anchor: { alignSelf: "stretch" },
  centerInner: { alignItems: "center" },
});
