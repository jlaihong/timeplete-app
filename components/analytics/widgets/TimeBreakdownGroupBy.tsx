import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
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
 * Productivity-One style Group By: first dimension is an inline select; each added
 * dimension is a plain label with × to remove; Add appends the next pool mode.
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
  const setPrimary = useCallback(
    (mode: GroupByMode) => {
      const next = [...levels];
      next[0] = mode;
      onChange(next);
    },
    [levels, onChange]
  );

  const removeAt = useCallback(
    (index: number) => {
      if (levels.length <= 1) return;
      onChange(levels.filter((_, j) => j !== index));
    },
    [levels, onChange]
  );

  const appendNext = useCallback(() => {
    const m = nextModeToAppend(tab, levels);
    if (m) onChange([...levels, m]);
  }, [tab, levels, onChange]);

  const canAppend = useMemo(
    () => nextModeToAppend(tab, levels) !== null,
    [tab, levels]
  );

  const appendLabel = useMemo(() => {
    const m = nextModeToAppend(tab, levels);
    return m ? GROUP_BY_LABEL[m] : "";
  }, [tab, levels]);

  const webPointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Group by</Text>
      <View style={styles.row}>
        {levels.map((mode, i) => (
          <View key={`slot-${i}`} style={styles.levelUnit}>
            {i === 0 ? (
              <AnalyticsSelect
                value={mode}
                options={pickerChoicesForRow(tab, levels, 0).map((m) => ({
                  value: m,
                  label: GROUP_BY_LABEL[m],
                }))}
                onChange={(v) => setPrimary(v as GroupByMode)}
              />
            ) : (
              <View style={styles.addedLevel}>
                <Text style={styles.addedLevelText} numberOfLines={1}>
                  {GROUP_BY_LABEL[mode]}
                </Text>
              </View>
            )}
            {levels.length > 1 ? (
              <Pressable
                onPress={() => removeAt(i)}
                style={({ pressed }) => [
                  styles.removeHit,
                  pressed && styles.removeHitPressed,
                  webPointer,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`Remove grouping ${GROUP_BY_LABEL[mode]}`}
                hitSlop={10}
              >
                <Ionicons name="close" size={18} color={Colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
        ))}

        {canAppend ? (
          <Pressable
            onPress={appendNext}
            style={({ pressed }) => [
              styles.iconBtn,
              pressed && styles.iconBtnPressed,
              webPointer,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add grouping: ${appendLabel}`}
            hitSlop={8}
          >
            <Ionicons name="add-circle-outline" size={22} color={Colors.primary} />
            <Text style={styles.iconBtnLabel}>Add</Text>
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
  levelUnit: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    maxWidth: "100%",
  },
  addedLevel: {
    height: 36,
    minWidth: 72,
    maxWidth: 160,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  addedLevelText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
  },
  removeHit: {
    padding: 4,
    marginLeft: -2,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  removeHitPressed: {
    opacity: 0.72,
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
  iconBtnPressed: {
    opacity: 0.85,
  },
  iconBtnLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.primary,
  },
});
