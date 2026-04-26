/**
 * Shared date field used by EventDialog and TaskDetailSheet so date
 * editing looks/behaves the same everywhere.
 *
 * Format contract (IMPORTANT):
 *   - `value` and `onChange` always speak the project-wide `YYYYMMDD`
 *     8-character format (no dashes), the same shape stored in Convex
 *     (`taskDay`, `startDayYYYYMMDD`, etc).
 *   - This component is the conversion boundary to/from the HTML5
 *     `<input type="date">` which mandates `YYYY-MM-DD`.
 *
 * Why this matters: `<input type="date">` silently rejects any value
 * that is not exactly `YYYY-MM-DD`, and would emit dashed strings on
 * change. Mixing those with raw `YYYYMMDD` strings used elsewhere
 * causes blank fields on read AND lex-sort breakage on write — for
 * example `"2026-04-22"` lex-sorts BEFORE `"20260421"` because `-`
 * (0x2D) precedes `0` (0x30), which silently flagged future tasks as
 * overdue.
 *
 * On web: renders a Material-style filled wrapper around a native
 * `<input type="date">` so the field visually matches the floating-
 * label `Input` (real OS date picker, keyboard nav, locale-aware
 * formatting; only the chrome is custom).
 * On native: falls back to the standard `Input` accepting `YYYYMMDD`.
 */
import React, { useState } from "react";
import { Platform, View, Text, StyleSheet, Pressable } from "react-native";
import { Colors } from "../../constants/colors";
import { Input } from "./Input";
import { yyyymmddToIsoDate, isoDateToYyyymmdd } from "../../lib/dates";

interface DateFieldProps {
  /** YYYYMMDD (8 chars, no dashes), or "" when unset. */
  value: string;
  /** Always emits YYYYMMDD, or "" if the user cleared the field. */
  onChange: (yyyymmdd: string) => void;
  label?: string;
  /** Optional placeholder text shown on native fallback. */
  placeholder?: string;
}

const FIELD_HORIZONTAL_PADDING = 12;
const FIELD_MIN_HEIGHT = 56;

export function DateField({
  value,
  onChange,
  label,
  placeholder = "YYYYMMDD",
}: DateFieldProps) {
  const [focused, setFocused] = useState(false);

  if (Platform.OS === "web") {
    // The browser-native picker uses ISO YYYY-MM-DD; convert at the
    // boundary so everything else in the app continues to use our
    // canonical YYYYMMDD shape.
    const isoValue = yyyymmddToIsoDate(value);
    const hasValue = isoValue.length > 0;
    const isFloating = focused || hasValue;
    const accent = focused ? Colors.primary : Colors.outline;
    const labelColor = focused ? Colors.primary : Colors.textSecondary;
    // Hide the browser's "yyyy-mm-dd" placeholder text when the field
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
            // The floating label is absolutely positioned and contributes
            // 0 to the field's intrinsic width, so without this the
            // field collapses to the native date input's natural size
            // and a long label like "Required weeks (out of the X
            // weeks)" would clip.
            // @ts-expect-error - aria-hidden is web-only and not on Text types.
            <Text aria-hidden pointerEvents="none" style={styles.labelGhost}>
              {label}
            </Text>
          ) : null}
          {React.createElement("input", {
            type: "date",
            value: isoValue,
            onChange: (e: { target: { value: string } }) =>
              onChange(isoDateToYyyymmdd(e.target.value)),
            onFocus: () => setFocused(true),
            onBlur: () => setFocused(false),
            style: {
              ...webDateInputStyle,
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
  return (
    <Input
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      autoCapitalize="none"
      containerStyle={{ marginBottom: 0 }}
    />
  );
}

const webDateInputStyle = {
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
  container: { marginBottom: 16 },
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
