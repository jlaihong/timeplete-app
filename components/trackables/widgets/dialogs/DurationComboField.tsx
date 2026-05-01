import React, { useCallback, useMemo, useState } from "react";
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
import { assessDurationHhMmInput } from "../../../../lib/dates";
import { applyDurationHhmmMask } from "../../../../lib/durationHhmmMask";
import {
  filterDurationComboOptions,
  type DurationComboFieldProps,
  type DurationComboOption,
} from "./durationComboShared";

/** Native: one row (mask + chevron) + modal preset list (`StartTimeComboField` parity). */
export function DurationComboField({
  label,
  value,
  onChange,
  allowNone,
}: DurationComboFieldProps) {
  const [open, setOpen] = useState(false);
  const filtered = useMemo(
    () => filterDurationComboOptions(value, allowNone),
    [value, allowNone]
  );

  const status = assessDurationHhMmInput(value, allowNone);
  const errText =
    status === "invalid" && value.length > 0
      ? "Enter a valid duration (hours:minutes, e.g. 1:30)."
      : undefined;
  const helper =
    !errText && status === "typing" && value.length > 0
      ? "Digits add automatically, e.g. 130 → 1:30"
      : undefined;

  const renderRow = useCallback(
    ({ item }: { item: DurationComboOption }) => (
      <TouchableOpacity
        style={[styles.row, item.value === value && styles.rowActive]}
        onPress={() => {
          onChange(item.value);
          setOpen(false);
        }}
      >
        <Text
          style={[
            styles.rowText,
            item.value === value && styles.rowTextActive,
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    ),
    [onChange, value]
  );

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
          onChangeText={(t) => onChange(applyDurationHhmmMask(t))}
          placeholder={allowNone ? "Optional — hh:mm" : "hh:mm"}
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
      {helper ? <Text style={styles.helperSmall}>{helper}</Text> : null}

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
              data={filtered}
              keyExtractor={(item, i) =>
                item.value === "" ? `none-${i}` : item.value
              }
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={renderRow}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  rowActive: { backgroundColor: Colors.primary + "18" },
  rowText: { fontSize: 14, color: Colors.text },
  rowTextActive: { fontWeight: "700", color: Colors.primary },
});
