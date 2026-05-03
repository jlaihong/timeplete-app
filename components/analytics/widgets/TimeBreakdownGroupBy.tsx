import React, { useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import type { AnalyticsTab } from "../AnalyticsState";
import {
  GROUP_BY_LABEL,
  GroupByMode,
  nextModeToAppend,
  pickerChoicesForRow,
} from "../../../lib/grouping";
import { AnalyticsSelect } from "./AnalyticsSelect";

/**
 * Productivity-One style Group By: ordered inline selects, add level, remove last level.
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

  const appendNext = useCallback(() => {
    const m = nextModeToAppend(tab, levels);
    if (m) onChange([...levels, m]);
  }, [tab, levels, onChange]);

  const removeLast = useCallback(() => {
    if (levels.length <= 1) return;
    onChange(levels.slice(0, -1));
  }, [levels, onChange]);

  const canAppend = useMemo(
    () => nextModeToAppend(tab, levels) !== null,
    [tab, levels]
  );

  const appendLabel = useMemo(() => {
    const m = nextModeToAppend(tab, levels);
    return m ? GROUP_BY_LABEL[m] : "";
  }, [tab, levels]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Group by</Text>
      <View style={styles.row}>
        {levels.map((mode, i) => (
          <React.Fragment key={`slot-${i}`}>
            {i > 0 ? (
              <Text style={styles.then}>then</Text>
            ) : null}
            <AnalyticsSelect
              value={mode}
              options={pickerChoicesForRow(tab, levels, i).map((m) => ({
                value: m,
                label: GROUP_BY_LABEL[m],
              }))}
              onChange={(v) => setSlot(i, v as GroupByMode)}
            />
          </React.Fragment>
        ))}

        {canAppend ? (
          <Pressable
            onPress={appendNext}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && styles.iconBtnPressed,
              Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add grouping: ${appendLabel}`}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            <Text style={styles.iconBtnLabel}>Add</Text>
          </Pressable>
        ) : null}

        {levels.length > 1 ? (
          <Pressable
            onPress={removeLast}
            style={({ pressed }) => [
              styles.iconBtn,
              styles.iconBtnMuted,
              pressed && styles.iconBtnPressed,
              Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Remove grouping: ${GROUP_BY_LABEL[levels[levels.length - 1]!]}`}
            hitSlop={8}
          >
            <Ionicons name="remove-circle-outline" size={22} color={Colors.textSecondary} />
            <Text style={styles.iconBtnLabelMuted}>Remove</Text>
          </Pressable>
        ) : null}
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
  then: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginRight: -4,
    marginLeft: -2,
  },
  iconBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  iconBtnMuted: {
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  iconBtnPressed: {
    opacity: 0.85,
  },
  iconBtnLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
  iconBtnLabelMuted: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
});
