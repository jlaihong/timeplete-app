import React, { useCallback, useMemo } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import type { AnalyticsTab } from "../AnalyticsState";
import {
  GROUP_BY_LABEL,
  GroupByMode,
  modesAvailableToAdd,
} from "../../../lib/grouping";
import { AnalyticsSelect } from "./AnalyticsSelect";

const ADD_PLACEHOLDER = "Add grouping…";

/**
 * Productivity-One style Group By: every selected dimension is a non-dropdown
 * chip with ×; remaining dimensions are picked from an Add dropdown.
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
  const removeAt = useCallback(
    (index: number) => {
      onChange(levels.filter((_, j) => j !== index));
    },
    [levels, onChange]
  );

  const addOptions = useMemo(() => {
    return modesAvailableToAdd(tab, levels).map((m) => ({
      value: m,
      label: GROUP_BY_LABEL[m],
    }));
  }, [tab, levels]);

  const webPointer = Platform.OS === "web" ? ({ cursor: "pointer" } as object) : null;

  const appendMode = useCallback(
    (raw: string) => {
      const m = raw as GroupByMode;
      if (!modesAvailableToAdd(tab, levels).includes(m)) return;
      onChange([...levels, m]);
    },
    [tab, levels, onChange]
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Group by</Text>
      <View style={styles.row}>
        {levels.map((mode, i) => (
          <View key={`slot-${i}`} style={styles.levelChip}>
            <Text style={styles.levelChipText} numberOfLines={1}>
              {GROUP_BY_LABEL[mode]}
            </Text>
            <Pressable
              onPress={() => removeAt(i)}
              style={({ pressed }) => [
                styles.removeHit,
                pressed && styles.removeHitPressed,
                webPointer,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Remove grouping ${GROUP_BY_LABEL[mode]}`}
              hitSlop={8}
            >
              <Ionicons name="close" size={16} color={Colors.textSecondary} />
            </Pressable>
          </View>
        ))}

        {addOptions.length > 0 ? (
          <AnalyticsSelect
            value=""
            placeholder={ADD_PLACEHOLDER}
            ariaLabel="Add grouping dimension"
            accessibilityLabel="Add grouping dimension"
            sheetTitle="Add grouping"
            options={addOptions}
            onChange={appendMode}
          />
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
  levelChip: {
    height: 36,
    minWidth: 72,
    maxWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 4,
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  levelChipText: {
    flex: 1,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
  },
  removeHit: {
    padding: 4,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },
  removeHitPressed: {
    opacity: 0.72,
  },
});
