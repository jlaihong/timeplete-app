import React from "react";
import { View, StyleSheet } from "react-native";
import { StartTimeComboField } from "./StartTimeComboField";
import { DurationComboField } from "./DurationComboField";

/** Start: one combobox — type + preset dropdown (P1 / DurationPicker pattern). */
export function TrackableLogStartTimeBlock({
  value,
  onChange,
}: {
  value: string;
  onChange: (hhmm: string) => void;
}) {
  return (
    <View style={styles.block}>
      <StartTimeComboField label="Start time" value={value} onChange={onChange} />
    </View>
  );
}

/** Duration: same single-field pattern — masked type + autocomplete presets (+ None when optional). */
export function TrackableLogDurationBlock({
  value,
  onChange,
  allowNone,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  allowNone: boolean;
}) {
  return (
    <View style={styles.block}>
      <DurationComboField
        label="Duration"
        value={value}
        onChange={onChange}
        allowNone={allowNone}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    marginBottom: 16,
    width: "100%",
  },
});
