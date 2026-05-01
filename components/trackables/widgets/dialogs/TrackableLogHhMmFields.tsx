import React, { useMemo } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { Colors } from "../../../../constants/colors";
import { StartTimeComboField } from "./StartTimeComboField";
import {
  assessDurationHhMmInput,
} from "../../../../lib/dates";
import {
  applyDurationHhmmMask,
} from "../../../../lib/durationHhmmMask";
import {
  TRACKABLE_DURATION_PRESETS,
} from "../../../../lib/trackableLogPresets";
import { CrossPlatformHhMmSelect, type HhMmSelectOption } from "./CrossPlatformHhMmSelect";
import { Input } from "../../../ui/Input";

function durationPresetOptions(allowNone: boolean): HhMmSelectOption[] {
  if (allowNone) {
    return [
      { value: "", label: "None" },
      ...TRACKABLE_DURATION_PRESETS.map((v) => ({ value: v, label: v })),
    ];
  }
  return TRACKABLE_DURATION_PRESETS.map((v) => ({ value: v, label: v }));
}

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

/** Duration: preset select + masked manual entry (productivity-one mask). */
export function TrackableLogDurationBlock({
  value,
  onChange,
  allowNone,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  allowNone: boolean;
}) {
  const presetOptions = useMemo(
    () => durationPresetOptions(allowNone),
    [allowNone]
  );
  const status = assessDurationHhMmInput(value, allowNone);
  const errorMsg =
    status === "invalid"
      ? "Enter a valid duration (hours:minutes, e.g. 1:30)."
      : undefined;
  const helper =
    !errorMsg && status === "typing" && value.length > 0
      ? "Digits add automatically, e.g. 130 → 1:30"
      : undefined;

  const onDigits = (t: string) => {
    onChange(applyDurationHhmmMask(t));
  };

  return (
    <View style={styles.block}>
      <Text style={styles.sectionLabel}>Duration</Text>
      <CrossPlatformHhMmSelect
        fieldLabel="Quick pick"
        ariaLabel="Duration preset"
        value={value}
        onChange={onChange}
        options={presetOptions}
      />
      <Text style={styles.hint}>Or type duration (HH:MM)</Text>
      <Input
        label="Duration"
        value={value}
        onChangeText={onDigits}
        placeholder={allowNone ? "Optional" : "0:30"}
        keyboardType={Platform.OS === "ios" ? "number-pad" : "numeric"}
        autoCapitalize="none"
        error={errorMsg}
        helperText={helper}
        containerStyle={{ marginBottom: 0 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: 8,
    marginBottom: 16,
    width: "100%",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.text,
  },
  hint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 4,
    marginBottom: 0,
  },
});
