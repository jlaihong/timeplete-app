import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../../constants/colors";

interface GoalStatItemProps {
  label: string;
  value: string;
  /** Optional secondary glyph (e.g. trend up/down arrow). */
  meta?: React.ReactNode;
}

/**
 * Mirror of productivity-one's `<app-goal-stat-item>` — a small label/value
 * pair used inside the tracker widget's stats rows.
 */
export function GoalStatItem({ label, value, meta }: GoalStatItemProps) {
  return (
    <View style={styles.item}>
      <View style={styles.row}>
        <Text style={styles.value}>{value}</Text>
        {meta}
      </View>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  value: { fontSize: 16, fontWeight: "700", color: Colors.text },
  label: {
    fontSize: 11,
    color: Colors.textTertiary,
    textTransform: "lowercase",
    marginTop: 1,
    textAlign: "center",
  },
});
