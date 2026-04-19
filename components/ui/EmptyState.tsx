import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";

interface EmptyStateProps {
  icon?: string;
  title: string;
  message?: string;
  action?: React.ReactNode;
  /**
   * When true (default), the root view uses `flex: 1` so the empty state
   * centers in a full-height screen. When false, omit `flex: 1` so the
   * component can sit inside a `ScrollView` / `ListEmptyComponent` without
   * expanding to swallow sibling touches (important on web).
   */
  fillScreen?: boolean;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  fillScreen = true,
}: EmptyStateProps) {
  return (
    <View
      style={[styles.container, !fillScreen && styles.containerInline]}
    >
      {icon && <Text style={styles.icon}>{icon}</Text>}
      <Text style={styles.title}>{title}</Text>
      {message && <Text style={styles.message}>{message}</Text>}
      {action && <View style={styles.action}>{action}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  containerInline: {
    flex: 0,
    flexGrow: 0,
    alignSelf: "stretch",
  },
  icon: { fontSize: 48, marginBottom: 16 },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  action: { marginTop: 20 },
});
