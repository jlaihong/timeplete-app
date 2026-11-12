import { FontSize, Radius } from "../../../theme/tokens";
import React, { useState } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";

export interface AnalyticsSelectOption {
  value: string;
  label: string;
}

/** Compact picker sheet — avoids fullscreen takeover on native. */
export function AnalyticsSelect({
  value,
  options,
  onChange,
  placeholder,
  sheetTitle,
  accessibilityLabel,
  ariaLabel,
}: {
  value: string;
  options: AnalyticsSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  sheetTitle?: string;
  accessibilityLabel?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const shellLabel =
    selected?.label ??
    (placeholder !== undefined && value === "" ? placeholder : value);

  return (
    <>
      <Pressable
        style={({ pressed }) => [styles.shell, pressed && styles.shellPressed]}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? ariaLabel}
      >
        <Text style={styles.shellText} numberOfLines={1}>
          {shellLabel}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <TouchableWithoutFeedback onPress={() => setOpen(false)}>
            <View style={styles.modalHit} />
          </TouchableWithoutFeedback>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{sheetTitle ?? "Group by"}</Text>
            <ScrollView keyboardShouldPersistTaps="handled">
              {options.map((o) => (
                <TouchableOpacity
                  key={o.value}
                  style={[
                    styles.option,
                    o.value === value && styles.optionActive,
                  ]}
                  onPress={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      o.value === value && styles.optionTextActive,
                    ]}
                  >
                    {o.label}
                  </Text>
                  {o.value === value ? (
                    <Ionicons name="checkmark" size={18} color={Colors.primary} />
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: 36,
    minWidth: 116,
    maxWidth: 200,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  shellPressed: { opacity: 0.88 },
  shellText: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
    marginRight: 6,
  },
  modalRoot: {
    flex: 1,
    justifyContent: "flex-start",
    paddingTop: 72,
    paddingHorizontal: 20,
  },
  modalHit: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderRadius: Radius.lg,
    maxHeight: 280,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    overflow: "hidden",
    zIndex: 2,
    elevation: 8,
  },
  sheetTitle: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: FontSize.caption,
    fontWeight: "700",
    color: Colors.textSecondary,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  optionActive: { backgroundColor: Colors.surfaceContainerHigh },
  optionText: { fontSize: FontSize.body, fontWeight: "600", color: Colors.text },
  optionTextActive: { fontWeight: "700", color: Colors.primary },
});
