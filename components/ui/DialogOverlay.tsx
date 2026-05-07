import React from "react";
import { Pressable } from "react-native";
import {
  dialogOverlayStyles,
  type DialogOverlayProps,
} from "./dialogOverlayShared";

export type { DialogOverlayProps } from "./dialogOverlayShared";

export function DialogOverlay({
  children,
  onBackdropPress,
  align = "center",
  zIndex = 1000,
}: DialogOverlayProps) {
  return (
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
}
