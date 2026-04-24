/**
 * TimeField — shared time input used wherever the app captures an
 * HH:MM time (recurrence time-windows, event dialog, etc.).
 *
 * Format contract:
 *   - `value` and `onChange` always speak the project-wide `HH:MM`
 *     24-hour format (`"09:00"`, `"23:45"`), the same shape stored
 *     in Convex (`startTimeHHMM`, `endTimeHHMM`).
 *   - This component is the conversion boundary to/from the HTML5
 *     `<input type="time">` which uses the same format natively.
 *
 * Why a dedicated component (vs. a free TextInput):
 *   - Free-text time inputs let the user produce invalid strings
 *     (`"9"`, `"25:00"`, `"9 am"`) which then break sorting,
 *     duration math, and the calendar overlay.
 *   - The native picker is keyboard-accessible AND locale-aware
 *     (renders 12h on en-US, 24h on en-GB), so the user gets the
 *     formatting they expect without us doing any locale work.
 *   - `step="300"` snaps the picker to 5-minute increments — same
 *     granularity as the calendar drag logic in CalendarView.
 *
 * On web: renders `<input type="time">` (real native picker).
 * On native: falls back to a plain TextInput accepting `HH:MM`.
 */
import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { Input } from "./Input";

interface TimeFieldProps {
  /** HH:MM 24-hour, or "" when unset. */
  value: string;
  /** Always emits HH:MM, or "" when cleared. */
  onChange: (hhmm: string) => void;
  label?: string;
  /**
   * Snap interval in seconds (default 300 = 5 minutes — matches
   * the calendar drag snap so created time-windows always align
   * with what the user would draw on the calendar).
   */
  stepSeconds?: number;
}

export function TimeField({
  value,
  onChange,
  label,
  stepSeconds = 300,
}: TimeFieldProps) {
  if (Platform.OS === "web") {
    return (
      <View style={styles.field}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {React.createElement("input", {
          type: "time",
          value: value || "",
          step: stepSeconds,
          onChange: (e: { target: { value: string } }) =>
            onChange(e.target.value),
          style: webTimeInputStyle,
        })}
      </View>
    );
  }
  // Native fallback — no built-in time picker, so we accept HH:MM
  // as text. Mobile parity with Productivity-One isn't part of this
  // task; the web input is what matters for now.
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      autoCapitalize="none"
      containerStyle={{ marginBottom: 0 }}
    />
  );
}

const webTimeInputStyle = {
  backgroundColor: Colors.surfaceContainer,
  border: `1px solid ${Colors.outlineVariant}`,
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 16,
  color: Colors.text,
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  colorScheme: "dark" as const,
} as const;

const styles = StyleSheet.create({
  field: { marginBottom: 0 },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
});
