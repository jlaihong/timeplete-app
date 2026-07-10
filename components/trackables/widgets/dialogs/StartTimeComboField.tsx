import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../constants/colors";
import { assessClockHhMmInput } from "../../../../lib/dates";
import { applyClockHhmmMask } from "../../../../lib/clockHhmmMask";
import {
  ALL_START_PRESETS,
  type StartTimeComboFieldProps,
} from "./startTimeComboShared";

/**
 * Native: single bounded row — type HH:MM + chevron opens the full preset
 * list scrolled to the current value.
 */
export function StartTimeComboField({
  label,
  value,
  onChange,
}: StartTimeComboFieldProps) {
  const [open, setOpen] = useState(false);
  // The modal is a deliberate picker (opened via the chevron), not a
  // type-ahead — always show every quarter-hour option. Filtering by
  // the pre-filled value used to collapse the list to a single row
  // until the user backspaced.
  const selectedIndex = useMemo(
    () => ALL_START_PRESETS.indexOf(value),
    [value]
  );

  const status = assessClockHhMmInput(value);
  const errText =
    status === "invalid" && value.length > 0
      ? "Enter a valid 24-hour time (HH:MM)."
      : undefined;

  return (
    <View style={styles.block}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View
        style={[
          styles.comboRow,
          errText ? { borderColor: Colors.error } : null,
        ]}
      >
        <TextInput
          style={styles.comboInput}
          value={value}
          onChangeText={(t) => onChange(applyClockHhmmMask(t))}
          placeholder="hh:mm"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="number-pad"
          autoCapitalize="none"
          accessibilityLabel={label}
        />
        <TouchableOpacity
          style={styles.comboChevron}
          onPress={() => setOpen(true)}
          accessibilityLabel={`${label} presets`}
        >
          <Ionicons name="chevron-down" size={20} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>
      {errText ? <Text style={styles.errorSmall}>{errText}</Text> : null}
      {!errText && status === "typing" && value.length > 0 ? (
        <Text style={styles.helperSmall}>24-hour format, e.g. 09:30</Text>
      ) : null}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable
            style={styles.modalCard}
            onPress={(e) => e.stopPropagation?.()}
          >
            <Text style={styles.modalTitle}>{label}</Text>
            <FlatList
              data={ALL_START_PRESETS}
              keyExtractor={(item) => item}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              // Open with the current time in view (rows have a fixed
              // height so the offset math is exact).
              initialScrollIndex={selectedIndex > 0 ? selectedIndex : 0}
              getItemLayout={(_, index) => ({
                length: ROW_HEIGHT,
                offset: ROW_HEIGHT * index,
                index,
              })}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.row, item === value && styles.rowActive]}
                  onPress={() => {
                    onChange(item);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.rowText,
                      item === value && styles.rowTextActive,
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

/** Fixed preset-row height so `getItemLayout` scroll offsets are exact. */
const ROW_HEIGHT = 44;

const styles = StyleSheet.create({
  block: { width: "100%", marginBottom: 0 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  comboRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    minHeight: 44,
  },
  comboInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  comboChevron: { paddingHorizontal: 10, paddingVertical: 8 },
  errorSmall: {
    fontSize: 12,
    color: Colors.error,
    marginTop: 6,
  },
  helperSmall: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    maxHeight: "70%",
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  list: { maxHeight: 360 },
  row: {
    height: ROW_HEIGHT,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  rowActive: { backgroundColor: Colors.primary + "18" },
  rowText: { fontSize: 14, color: Colors.text },
  rowTextActive: { fontWeight: "700", color: Colors.primary },
});
