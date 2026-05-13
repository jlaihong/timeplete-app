import React from "react";
import { Pressable } from "react-native";
import { createPortal } from "react-dom";
import {
  dialogOverlayStyles,
  type DialogOverlayProps,
} from "./dialogOverlayShared";
import { useRegisterEscapeClose } from "../../hooks/useRegisterEscapeClose";

export type { DialogOverlayProps } from "./dialogOverlayShared";

export function DialogOverlay({
  children,
  onBackdropPress,
  align = "center",
  zIndex = 1000,
}: DialogOverlayProps) {
  useRegisterEscapeClose(onBackdropPress);

  const tree = (
    <Pressable
      style={[
        dialogOverlayStyles.overlay,
        align === "center"
          ? dialogOverlayStyles.overlayCenter
          : dialogOverlayStyles.overlayBottom,
        { zIndex },
      ]}
      onPress={onBackdropPress}
    >
      <Pressable onPress={(e) => e.stopPropagation?.()}>{children}</Pressable>
    </Pressable>
  );

  if (typeof document === "undefined") {
    return tree;
  }
  return createPortal(tree, document.body);
}
