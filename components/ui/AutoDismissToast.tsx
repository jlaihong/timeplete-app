import React, { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";

type Props = {
  /** When non-null, the toast is visible until auto-dismissed. */
  message: string | null;
  /** Called after the toast has auto-dismissed. */
  onDismiss: () => void;
  durationMs?: number;
};

/**
 * Lightweight snackbar-style toast (same pattern on web + native).
 * Renders fixed at bottom so it clears modals overlays without closing them.
 */
export function AutoDismissToast({
  message,
  onDismiss,
  durationMs = 2600,
}: Props) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => {
      onDismiss();
    }, durationMs);
    return () => clearTimeout(id);
  }, [message, durationMs, onDismiss]);

  if (!message) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.pill}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 28,
    left: 0,
    right: 0,
    zIndex: 100000,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 10,
  },
  text: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
});
