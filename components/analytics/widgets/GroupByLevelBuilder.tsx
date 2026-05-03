import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import type { AnalyticsTab } from "../AnalyticsState";
import {
  GROUP_BY_DISPLAY_LABEL,
  MAX_GROUP_BY_LEVELS,
  GroupByMode,
  nextAvailableMode,
  pickerChoicesForRow,
} from "../../../lib/grouping";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface GroupByLevelBuilderProps {
  tab: AnalyticsTab;
  levels: GroupByMode[];
  onChange: (next: GroupByMode[]) => void;
}

export function GroupByLevelBuilder({
  tab,
  levels,
  onChange,
}: GroupByLevelBuilderProps) {
  const [openRow, setOpenRow] = useState<number | null>(null);

  const summary = useMemo(
    () =>
      levels.map((m) => GROUP_BY_DISPLAY_LABEL[m]).join(" → ") ||
      GROUP_BY_DISPLAY_LABEL.trackable,
    [levels]
  );

  const canAdd =
    levels.length < MAX_GROUP_BY_LEVELS && nextAvailableMode(tab, levels);

  const applyLevels = useCallback(
    (next: GroupByMode[]) => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      onChange(next);
    },
    [onChange]
  );

  const selectMode = useCallback(
    (rowIndex: number, mode: GroupByMode) => {
      const next = [...levels];
      next[rowIndex] = mode;
      applyLevels(next);
      setOpenRow(null);
    },
    [levels, applyLevels]
  );

  const removeRow = useCallback(
    (rowIndex: number) => {
      if (levels.length <= 1) return;
      applyLevels(levels.filter((_, j) => j !== rowIndex));
    },
    [levels, applyLevels]
  );

  const addRow = useCallback(() => {
    const na = nextAvailableMode(tab, levels);
    if (!na || levels.length >= MAX_GROUP_BY_LEVELS) return;
    applyLevels([...levels, na]);
  }, [tab, levels, applyLevels]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.sectionLabel}>Group by</Text>
      <Text style={styles.sequenceHint} numberOfLines={2}>
        {summary}
      </Text>

      {levels.map((mode, rowIndex) => {
        const open = openRow === rowIndex;
        return (
          <View key={`gb-row-${rowIndex}`} style={styles.row}>
            <Pressable
              style={({ pressed }) => [
                styles.selectShell,
                pressed && styles.selectPressed,
              ]}
              onPress={() => setOpenRow(open ? null : rowIndex)}
              accessibilityRole="button"
              accessibilityLabel={`Grouping level ${rowIndex + 1}: ${GROUP_BY_DISPLAY_LABEL[mode]}`}
            >
              <Text style={styles.selectValue} numberOfLines={1}>
                {GROUP_BY_DISPLAY_LABEL[mode]}
              </Text>
              <Ionicons
                name={open ? "chevron-up" : "chevron-down"}
                size={18}
                color={Colors.textSecondary}
              />
            </Pressable>

            {levels.length > 1 ? (
              <TouchableOpacity
                style={styles.removeBtn}
                onPress={() => removeRow(rowIndex)}
                accessibilityRole="button"
                accessibilityLabel={`Remove grouping level ${GROUP_BY_DISPLAY_LABEL[mode]}`}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={22} color={Colors.textTertiary} />
              </TouchableOpacity>
            ) : (
              <View style={styles.removePlaceholder} />
            )}
          </View>
        );
      })}

      <Modal
        visible={openRow !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setOpenRow(null)}
      >
        <View style={styles.modalBackdrop}>
          <TouchableWithoutFeedback onPress={() => setOpenRow(null)}>
            <View style={styles.modalBackdropHit} />
          </TouchableWithoutFeedback>
          {openRow !== null ? (
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>
                {GROUP_BY_DISPLAY_LABEL[levels[openRow]!]!}
              </Text>
              <ScrollView
                style={styles.modalScroll}
                keyboardShouldPersistTaps="handled"
              >
                {pickerChoicesForRow(tab, levels, openRow).map((m) => {
                  const rowMode = levels[openRow]!;
                  return (
                    <TouchableOpacity
                      key={m}
                      style={[
                        styles.optionRow,
                        m === rowMode && styles.optionRowActive,
                      ]}
                      onPress={() => selectMode(openRow, m)}
                    >
                      <Text
                        style={[
                          styles.optionLabel,
                          m === rowMode && styles.optionLabelActive,
                        ]}
                      >
                        {GROUP_BY_DISPLAY_LABEL[m]}
                      </Text>
                      {m === rowMode ? (
                        <Ionicons
                          name="checkmark"
                          size={18}
                          color={Colors.primary}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>

      {canAdd ? (
        <TouchableOpacity
          style={styles.addBtn}
          onPress={addRow}
          accessibilityRole="button"
          accessibilityLabel="Add grouping level"
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
          <Text style={styles.addBtnLabel}>Add grouping level</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 14,
    alignSelf: "stretch",
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  sequenceHint: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  selectShell: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  selectPressed: { opacity: 0.85 },
  selectValue: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginRight: 8,
  },
  removeBtn: {
    padding: 4,
  },
  removePlaceholder: { width: 30 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  modalBackdropHit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  modalCard: {
    maxHeight: "70%",
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: "hidden",
  },
  modalTitle: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    fontSize: 13,
    fontWeight: "700",
    color: Colors.textSecondary,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  modalScroll: { maxHeight: 320 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  optionRowActive: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text,
  },
  optionLabelActive: {
    fontWeight: "700",
    color: Colors.primary,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    marginTop: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  addBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.primary,
  },
});
