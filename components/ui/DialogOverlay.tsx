import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  dialogOverlayStyles,
  type DialogOverlayProps,
} from "./dialogOverlayShared";

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
  return (
    <View
      style={[
        dialogOverlayStyles.overlay,
        align === "center"
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
      {children}
    </View>
  );
}
