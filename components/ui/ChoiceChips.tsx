import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";

export interface ChoiceChip<T> {
  value: T;
  label: string;
}

/**
 * A row of one-tap choices (Today / Tomorrow / No date, 15m / 30m / 1h).
 * Faster on a phone than opening a picker for the common answers. Tapping
 * the selected chip again clears it when `allowClear` is set.
 */
export function ChoiceChips<T extends string | number | null>({
  label,
  chips,
  value,
  onChange,
  allowClear = false,
  clearValue,
}: {
  label?: string;
  chips: ChoiceChip<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  allowClear?: boolean;
  /** Value reported when the selected chip is tapped again. */
  clearValue?: T;
}) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row}>
        {chips.map((chip) => {
          const selected = chip.value === value;
          return (
            <Pressable
              key={String(chip.value)}
              onPress={() => {
                if (selected && allowClear && clearValue !== undefined) {
                  onChange(clearValue);
                } else {
                  onChange(chip.value);
                }
              }}
              hitSlop={{ top: 4, bottom: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label ? `${label}: ${chip.label}` : chip.label}
              style={[styles.chip, selected && styles.chipSelected]}
            >
              <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
              >
                {chip.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 12 },
  label: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    minHeight: 36,
    paddingHorizontal: 11,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  chipSelected: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primary,
  },
  chipText: { fontSize: FontSize.body, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.onPrimaryContainer, fontWeight: "600" },
});
