import React, { useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../../constants/colors";

type Props = {
  /** When non-null, the toast is visible until auto-dismissed. */
  message: string | null;
  /** Called after the toast has auto-dismissed. */
  onDismiss: () => void;
  durationMs?: number;
  /** Optional action (e.g. Undo) — enables longer default duration and tap handling. */
  actionLabel?: string | null;
  onAction?: () => void;
};

const DEFAULT_DURATION_MS = 2600;
const ACTION_DURATION_MS = 5600;

/**
 * Lightweight snackbar-style toast (same pattern on web + native).
 * Renders fixed at bottom so it clears modals overlays without closing them.
 */
export function AutoDismissToast({
  message,
  onDismiss,
  durationMs,
  actionLabel,
  onAction,
}: Props) {
  const hasAction = Boolean(actionLabel && onAction);
  const resolvedDuration =
    durationMs ??
    (hasAction ? ACTION_DURATION_MS : DEFAULT_DURATION_MS);

  useEffect(() => {
    if (!message) return;
    const id = setTimeout(() => {
      onDismiss();
    }, resolvedDuration);
    return () => clearTimeout(id);
  }, [message, resolvedDuration, onDismiss]);

  if (!message) return null;

  return (
    <View
      style={styles.wrap}
      pointerEvents={hasAction ? "box-none" : "none"}
    >
      <View style={styles.pill} pointerEvents="auto">
        {hasAction ? (
          <View style={styles.pillRow}>
            <Text style={[styles.text, styles.textFlexible]}>{message}</Text>
            <TouchableOpacity
              onPress={() => {
                onAction?.();
                onDismiss();
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={actionLabel ?? "Action"}
            >
              <Text style={styles.actionText}>{actionLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.text}>{message}</Text>
        )}
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
  pillRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    maxWidth: "100%",
  },
  textFlexible: {
    flexShrink: 1,
    textAlign: "left",
  },
  text: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: "500",
    textAlign: "center",
  },
  actionText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: "600",
  },
});
