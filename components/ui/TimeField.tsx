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
 * On web: renders `<input type="time">` inside a Material-style filled
 * wrapper so the field visually matches the floating-label `Input`.
 * On native: falls back to the standard `Input` accepting `HH:MM`.
 */
import React, { useState } from "react";
import { Platform, View, Text, StyleSheet, Pressable } from "react-native";
import { Colors } from "../../constants/colors";
import { assessClockHhMmInput } from "../../lib/dates";
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

const FIELD_HORIZONTAL_PADDING = 12;
const FIELD_MIN_HEIGHT = 56;

export function TimeField({
  value,
  onChange,
  label,
  stepSeconds = 300,
}: TimeFieldProps) {
  const [focused, setFocused] = useState(false);

  if (Platform.OS === "web") {
    const hasValue = !!value;
    const isFloating = focused || hasValue;
    const accent = focused ? Colors.primary : Colors.outline;
    const labelColor = focused ? Colors.primary : Colors.textSecondary;
    // Hide the browser's "--:-- --" placeholder text when the field
    // is at rest so the floating label can sit centered as the
    // placeholder (matches productivity-one's mat-form-field). Once
    // the user focuses or picks a value, the label floats up and the
    // native placeholder/value reappears in the freed-up space.
    const showNativeText = label ? isFloating : true;

    return (
      <View style={styles.container}>
        <Pressable style={styles.field}>
          {label ? (
            <Text
              style={[
                styles.label,
                {
                  top: isFloating ? 6 : 18,
                  fontSize: isFloating ? 12 : 16,
                  color: labelColor,
                },
              ]}
            >
              {label}
            </Text>
          ) : null}
          {label ? (
            // Width-reserving ghost — see Input.tsx for full rationale.
            // @ts-expect-error - aria-hidden is web-only and not on Text types.
            <Text aria-hidden pointerEvents="none" style={styles.labelGhost}>
              {label}
            </Text>
          ) : null}
          {React.createElement("input", {
            type: "time",
            value: value || "",
            step: stepSeconds,
            onChange: (e: { target: { value: string } }) =>
              onChange(e.target.value),
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            style: {
              ...webTimeInputStyle,
              color: showNativeText ? Colors.text : "transparent",
            },
          })}
          <View
            style={[
              styles.underline,
              { backgroundColor: accent, height: focused ? 2 : 1 },
            ]}
          />
        </Pressable>
      </View>
    );
  }
  // Native fallback — validate 24-hour HH:MM while typing (matches web
  // `<input type="time">` behaviour where invalid times cannot be committed).
  const status = assessClockHhMmInput(value);
  const nativeError =
    status === "invalid"
      ? "Enter a valid 24-hour time (HH:MM)."
      : undefined;
  const nativeHelper =
    !nativeError && status === "typing" && value.length > 0
      ? "24-hour format, e.g. 09:30"
      : undefined;
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder="HH:MM"
      autoCapitalize="none"
      error={nativeError}
      helperText={nativeHelper}
      containerStyle={{ marginBottom: 0 }}
    />
  );
}

const webTimeInputStyle = {
  background: "transparent",
  border: "none",
  outline: "none",
  padding: "22px 0 8px 0",
  fontSize: 16,
  color: Colors.text,
  width: "100%",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
  colorScheme: "dark" as const,
} as const;

const styles = StyleSheet.create({
  container: { marginBottom: 0 },
  field: {
    backgroundColor: Colors.surfaceContainerHighest,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    paddingHorizontal: FIELD_HORIZONTAL_PADDING,
    minHeight: FIELD_MIN_HEIGHT,
    justifyContent: "flex-end",
    position: "relative",
    overflow: "hidden",
  },
  label: {
    position: "absolute",
    left: FIELD_HORIZONTAL_PADDING,
    fontWeight: "400",
  },
  labelGhost: {
    fontSize: 16,
    fontWeight: "400",
    height: 0,
    lineHeight: 0,
    opacity: 0,
    overflow: "hidden",
  },
  underline: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
});
