import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../constants/colors";

interface CompletedBadgeProps {
  /** Trackable colour — used for the check icon's background. */
  colour: string;
  /** Total achieved (display units, e.g. hours or count). */
  current: number;
  /** Target (display units). */
  target: number;
  /** "h" for hours, omit for raw counts. */
  unitSuffix?: string;
}

/**
 * Mirror of productivity-one's `@if (isCompleted())` branch on the
 * `goal-widget` body — replaces the stats row when a non-tracker goal
 * (`TIME_TRACK` / `NUMBER`) has met its lifetime target.
 */
export function CompletedBadge({
  colour,
  current,
  target,
  unitSuffix = "",
}: CompletedBadgeProps) {
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: colour }]}>
        <Ionicons name="checkmark" size={14} color={Colors.onPrimary} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>Goal completed!</Text>
        <Text style={styles.sub}>
          {fmt(current)}
          {unitSuffix} / {fmt(target)}
          {unitSuffix}
        </Text>
      </View>
    </View>
  );
}

function fmt(n: number): string {
  if (!isFinite(n)) return "0";
  return (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 4,
    alignSelf: "stretch",
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  copy: { alignItems: "center" },
  title: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  sub: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
    textAlign: "center",
  },
});
