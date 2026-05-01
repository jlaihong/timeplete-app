import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Modal,
  FlatList,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../constants/colors";

export interface HhMmSelectOption {
  value: string;
  label: string;
}

export interface CrossPlatformHhMmSelectProps {
  fieldLabel: string;
  value: string;
  onChange: (next: string) => void;
  options: HhMmSelectOption[];
  /** Shown on the native trigger / accessibility */
  ariaLabel?: string;
}

const webSelectStyle = {
  backgroundColor: Colors.surfaceContainer,
  border: `1px solid ${Colors.outlineVariant}`,
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 14,
  color: Colors.text,
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontVariantNumeric: "tabular-nums" as const,
  colorScheme: "dark" as const,
  cursor: "pointer",
};

/**
 * Cross-platform HH:MM field: native `<select>` on web (keyboard, scroll,
 * accessibility); Modal list on iOS/Android — same pattern as `ListPicker`
 * so options aren’t clipped inside nested dialogs.
 */
export function CrossPlatformHhMmSelect({
  fieldLabel,
  value,
  onChange,
  options,
  ariaLabel,
}: CrossPlatformHhMmSelectProps) {
  useEffect(() => {
    if (options.length === 0) return;
    if (!options.some((o) => o.value === value)) {
      onChange(options[0]!.value);
    }
  }, [value, options, onChange]);

  const resolved = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    if (hit) return hit;
    return options[0] ?? { value: "", label: "" };
  }, [options, value]);

  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        <Text style={styles.fieldLabel}>{fieldLabel}</Text>
        {React.createElement(
          "select",
          {
            value: resolved.value,
            onChange: (e: { target: { value: string } }) =>
              onChange(e.target.value),
            style: webSelectStyle,
            "aria-label": ariaLabel ?? fieldLabel,
          },
          options.map((opt) =>
            React.createElement(
              "option",
              { key: opt.value === "" ? "__empty__" : opt.value, value: opt.value },
              opt.label
            )
          )
        )}
      </View>
    );
  }

  return (
    <NativeHhMmSelect
      fieldLabel={fieldLabel}
      value={value}
      displayLabel={resolved.label}
      onChange={onChange}
      options={options}
      ariaLabel={ariaLabel ?? fieldLabel}
    />
  );
}

function NativeHhMmSelect({
  fieldLabel,
  value,
  displayLabel,
  onChange,
  options,
  ariaLabel,
}: {
  fieldLabel: string;
  value: string;
  displayLabel: string;
  onChange: (next: string) => void;
  options: HhMmSelectOption[];
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{fieldLabel}</Text>
      <TouchableOpacity
        style={styles.trigger}
        onPress={() => setOpen(true)}
        accessibilityLabel={ariaLabel}
        accessibilityRole="button"
      >
        <Text style={styles.triggerText} numberOfLines={1}>
          {displayLabel}
        </Text>
        <Ionicons name="chevron-down" size={18} color={Colors.textSecondary} />
      </TouchableOpacity>

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
            <Text style={styles.modalTitle}>{fieldLabel}</Text>
            <FlatList
              data={options}
              keyExtractor={(item, index) =>
                item.value === "" ? `empty-${index}` : item.value
              }
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const active = item.value === value;
                return (
                  <TouchableOpacity
                    style={[styles.row, active && styles.rowActive]}
                    onPress={() => {
                      onChange(item.value);
                      setOpen(false);
                    }}
                  >
                    <Text
                      style={[styles.rowText, active && styles.rowTextActive]}
                    >
                      {item.label}
                    </Text>
                    {active ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={Colors.primary}
                      />
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flex: 1, minWidth: 140 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  triggerText: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  rowActive: { backgroundColor: Colors.primary + "18" },
  rowText: {
    fontSize: 14,
    color: Colors.text,
  },
  rowTextActive: { fontWeight: "700", color: Colors.primary },
});
