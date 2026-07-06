import React from "react";
import { createPortal } from "react-dom";
import {
  dialogOverlayStyles,
  type DialogOverlayProps,
} from "./dialogOverlayShared";
import { useRegisterEscapeClose } from "../../hooks/useRegisterEscapeClose";
import { useVisualViewportHeight } from "../../hooks/useVisualViewportHeight";

export type { DialogOverlayProps } from "./dialogOverlayShared";

/**
 * Web dialog backdrop.
 *
 * We deliberately render plain DOM (`<div>`) here rather than the previous
 * nested `<Pressable onPress={backdrop}> <Pressable onPress={stopPropagation}> …`
 * pattern. With `react-native-web@0.21` + React 19 that arrangement was
 * fragile: `Pressable`'s responder chain interacted with the outer
 * stop-propagation wrapper in a way that intermittently swallowed the
 * deepest `Pressable.onPress` — so the Edit Trackable dialog's header ✕
 * and footer Cancel button would visibly click but never invoke `onClose`.
 *
 * The DOM approach instead uses `event.target === event.currentTarget` to
 * detect a genuine backdrop click, letting every interactive child receive
 * its own click uninterrupted. Escape handling is unchanged.
 */
export function DialogOverlay({
  children,
  onBackdropPress,
  align = "center",
  zIndex = 1000,
}: DialogOverlayProps) {
  useRegisterEscapeClose(onBackdropPress);

  // On mobile web, when the software keyboard opens the *layout* viewport
  // stays the same size but the *visual* viewport shrinks. Since our
  // backdrop uses `position: fixed` (which sizes against the layout
  // viewport), the dialog's bottom would slide underneath the keyboard —
  // hiding inputs the user still needs to reach. Sizing the overlay to
  // `visualViewport.height` instead makes the whole dialog stay above the
  // keyboard, mirroring what native platforms do with `adjustResize`.
  const vvHeight = useVisualViewportHeight();

  // Flatten the RN StyleSheet definitions into inline CSS so we can render
  // a plain `<div>` while keeping visuals identical to the native overlay.
  const overlayBg =
    dialogOverlayStyles.overlay.backgroundColor as string | undefined;

  const backdropStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    // When we know the visual viewport height, pin the overlay to that
    // so the dialog shrinks with the keyboard. Fall back to `bottom: 0`
    // for browsers without `window.visualViewport`.
    ...(vvHeight != null ? { height: vvHeight } : { bottom: 0 }),
    backgroundColor: overlayBg ?? "rgba(0,0,0,0.6)",
    display: "flex",
    flexDirection: "column",
    justifyContent: align === "center" ? "center" : "flex-end",
    alignItems: align === "center" ? "center" : "stretch",
    zIndex,
  };

  const tree = (
    <div
      style={backdropStyle}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onBackdropPress();
        }
      }}
    >
      {children}
    </div>
  );

  if (typeof document === "undefined") {
    return tree;
  }
  return createPortal(tree, document.body);
}
