import type { ReactNode } from "react";
import { StyleSheet, Platform, type ViewStyle } from "react-native";

export interface DialogOverlayProps {
  children: ReactNode;
  onBackdropPress: () => void;
  align?: "center" | "bottom";
  zIndex?: number;
}

/**
 * Full-viewport overlay styles — shared by native `DialogOverlay` and web portal.
 */
export const dialogOverlayStyles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    ...Platform.select({
      web: { position: "fixed" as ViewStyle["position"] },
      default: {},
    }),
  },
  overlayCenter: { justifyContent: "center", alignItems: "center" },
  overlayBottom: { justifyContent: "flex-end" },
});
