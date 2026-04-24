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
 * On web: renders a native HTML5 `<input type="date">` (real OS date
 * picker, keyboard nav, locale-aware formatting).
 * On native: falls back to a plain TextInput accepting `YYYYMMDD`.
 */
import React from "react";
import { Platform, View, Text, StyleSheet } from "react-native";
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

export function DateField({
  value,
  onChange,
  label,
  placeholder = "YYYYMMDD",
}: DateFieldProps) {
  if (Platform.OS === "web") {
    // The browser-native picker uses ISO YYYY-MM-DD; convert at the
    // boundary so everything else in the app continues to use our
    // canonical YYYYMMDD shape.
    const isoValue = yyyymmddToIsoDate(value);
    return (
      <View style={styles.field}>
        {label ? <Text style={styles.label}>{label}</Text> : null}
        {React.createElement("input", {
          type: "date",
          value: isoValue,
          onChange: (e: { target: { value: string } }) =>
            onChange(isoDateToYyyymmdd(e.target.value)),
          style: webDateInputStyle,
        })}
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
  field: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 6,
  },
});
