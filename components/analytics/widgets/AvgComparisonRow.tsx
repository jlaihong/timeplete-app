import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";

interface AvgComparisonRowProps {
  label: string;
  current: number;
  average: number;
  /** Format a number for display (e.g. "1.5", "3", "2h 15m"). */
  formatValue?: (n: number) => string;
}

/* ──────────────────────────────────────────────────────────────────── *
 * Mirror of productivity-one's "{frequency} avg: <n> ↑/↓" row used by
 * every weekly analytics widget and the line-chart footer.
 *
 * Up arrow + green if `current > average` (you beat your usual pace);
 * down arrow + red if `current < average`; nothing if they're equal.
 * ──────────────────────────────────────────────────────────────────── */
export function AvgComparisonRow({
  label,
  current,
  average,
  formatValue,
}: AvgComparisonRowProps) {
  if (!Number.isFinite(average) || average <= 0) return null;
  const fmt = formatValue ?? ((n: number) => n.toFixed(1));
  const better = current > average;
  const worse = current < average;
  return (
    <View style={styles.row}>
      <Text style={styles.text}>
        {label} {fmt(average)}
      </Text>
      {better && (
        <Ionicons name="caret-up" size={12} color={Colors.success} />
      )}
      {worse && (
        <Ionicons name="caret-down" size={12} color={Colors.error} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    marginTop: 2,
  },
  text: {
    fontSize: 11,
    color: Colors.textTertiary,
  },
});
