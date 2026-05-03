import React, { useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import type { AnalyticsTab } from "../AnalyticsState";
import {
  GROUP_BY_LABEL,
  GroupByMode,
  pickerChoicesForRow,
} from "../../../lib/grouping";
import { AnalyticsSelect } from "./AnalyticsSelect";

/**
 * Productivity-One style inline Group By row — one dropdown per ordered slot;
 * changes apply immediately (no builder / add-level flow).
 */
export function TimeBreakdownGroupBy({
  tab,
  levels,
  onChange,
}: {
  tab: AnalyticsTab;
  levels: GroupByMode[];
  onChange: (next: GroupByMode[]) => void;
}) {
  const setSlot = useCallback(
    (index: number, mode: GroupByMode) => {
      const next = [...levels];
      next[index] = mode;
      onChange(next);
    },
    [levels, onChange]
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Group by</Text>
      <View style={styles.row}>
        {levels.map((mode, i) => (
          <AnalyticsSelect
            key={`slot-${i}`}
            value={mode}
            options={pickerChoicesForRow(tab, levels, i).map((m) => ({
              value: m,
              label: GROUP_BY_LABEL[m],
            }))}
            onChange={(v) => setSlot(i, v as GroupByMode)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: "stretch",
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
});
