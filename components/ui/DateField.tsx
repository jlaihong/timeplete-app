/**
 * Shared date field used by EventDialog, TaskDetailSheet, the goal forms
 * and RecurrenceSection so date editing looks/behaves the same everywhere.
 *
 * Format contract (IMPORTANT):
 *   - `value` and `onChange` always speak the project-wide `YYYYMMDD`
 *     8-character format (no dashes), the same shape stored in Convex
 *     (`taskDay`, `startDayYYYYMMDD`, etc).
 *   - This component is the conversion boundary to/from the HTML5
 *     `<input type="date">` (which mandates `YYYY-MM-DD`) and the native
 *     platform pickers (which speak `Date`).
 *
 * Why this matters: `<input type="date">` silently rejects any value
 * that is not exactly `YYYY-MM-DD`, and would emit dashed strings on
 * change. Mixing those with raw `YYYYMMDD` strings used elsewhere
 * causes blank fields on read AND lex-sort breakage on write — for
 * example `"2026-04-22"` lex-sorts BEFORE `"20260421"` because `-`
 * (0x2D) precedes `0` (0x30), which silently flagged future tasks as
 * overdue.
 *
 * On web: a Material-style filled wrapper around a native
 * `<input type="date">`. Clicking ANYWHERE on the field opens the
 * browser's calendar via `showPicker()` (not just the tiny built-in
 * icon), with a trailing calendar glyph as the affordance. Keyboard
 * entry still works — the input remains a real focusable input.
 * On native: the field is a Pressable showing the date in a friendly
 * locale format ("Jan 2, 2026"); tapping opens the platform date
 * picker (Material calendar dialog on Android, spinner sheet on iOS)
 * instead of asking the user to type 8 digits.
 */
import React, { useRef, useState } from "react";
import {
  Platform,
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
} from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import {
  yyyymmddToIsoDate,
  isoDateToYyyymmdd,
  parseYYYYMMDD,
  formatYYYYMMDD,
} from "../../lib/dates";

interface DateFieldProps {
  /** YYYYMMDD (8 chars, no dashes), or "" when unset. */
  value: string;
  /** Always emits YYYYMMDD, or "" if the user cleared the field. */
  onChange: (yyyymmdd: string) => void;
  label?: string;
  /** Placeholder shown when no value is set (native only). */
  placeholder?: string;
  /**
   * Shows a trailing ✕ that resets the value to "". Only enable for
   * genuinely optional dates — native pickers have no built-in clear.
   */
  clearable?: boolean;
}

const FIELD_HORIZONTAL_PADDING = 12;
const FIELD_MIN_HEIGHT = 56;

/** Friendly display for the native field: "Jan 2, 2026". */
function formatForDisplay(yyyymmdd: string): string {
  if (yyyymmdd.length !== 8) return "";
  return parseYYYYMMDD(yyyymmdd).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function DateField(props: DateFieldProps) {
  if (Platform.OS === "web") {
    return <WebDateField {...props} />;
  }
  return <NativeDateField {...props} />;
}

/* ──────────────────────────── web ──────────────────────────── */

/**
 * Web-only global style: hides the browser's built-in calendar glyph on
 * our date inputs (we render our own trailing icon and the whole field
 * opens the picker), while keeping the input itself fully functional
 * for keyboard entry.
 */
function DateInputChromeStyle() {
  return React.createElement("style", null, [
    `input.tp-date-input::-webkit-calendar-picker-indicator {`,
    `  display: none;`,
    `}`,
  ].join("\n"));
}

interface WebDateInputEl {
  focus: () => void;
  showPicker?: () => void;
}

function WebDateField({ value, onChange, label, clearable }: DateFieldProps) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<WebDateInputEl | null>(null);

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

  const openPicker = () => {
    const el = inputRef.current;
    if (!el) return;
    // showPicker() throws when unsupported (older Safari) or when not
    // triggered by a user gesture — fall back to plain focus, which
    // still lets the user type or use the browser's built-in icon.
    try {
      el.showPicker?.();
    } catch {
      /* fall through to focus */
    }
    el.focus();
  };

  return (
    <View style={styles.container}>
      <Pressable style={styles.field} onPress={openPicker}>
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
          <Text aria-hidden pointerEvents="none" style={styles.labelGhost}>
            {label}
          </Text>
        ) : null}
        <DateInputChromeStyle />
        <View style={styles.webInputRow}>
          {React.createElement("input", {
            ref: inputRef,
            className: "tp-date-input",
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
          {clearable && hasValue ? (
            <ClearButton onPress={() => onChange("")} />
          ) : (
            <MaterialIcons
              name="calendar-today"
              size={18}
              color={Colors.textSecondary}
              style={styles.trailingIcon}
            />
          )}
        </View>
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

/* ─────────────────────────── native ─────────────────────────── */

function NativeDateField({
  value,
  onChange,
  label,
  placeholder = "Pick a date",
  clearable,
}: DateFieldProps) {
  // iOS renders the picker inline inside a modal sheet; Android uses
  // the imperative Material dialog API (no mounted component at all).
  const [iosPickerOpen, setIosPickerOpen] = useState(false);
  // Draft while the iOS spinner is open — only committed on "Done" so
  // Cancel doesn't leak intermediate spins to the parent.
  const [iosDraft, setIosDraft] = useState<Date | null>(null);

  const hasValue = value.length === 8;
  const currentDate = hasValue ? parseYYYYMMDD(value) : new Date();
  const isFloating = hasValue;

  const openPicker = () => {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: currentDate,
        mode: "date",
        onChange: (event, date) => {
          if (event.type === "set" && date) onChange(formatYYYYMMDD(date));
        },
      });
      return;
    }
    setIosDraft(currentDate);
    setIosPickerOpen(true);
  };

  return (
    <View style={styles.container}>
      <Pressable
        style={styles.field}
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel={label ? `${label}, pick a date` : "Pick a date"}
      >
        {label ? (
          <Text
            style={[
              styles.label,
              {
                top: isFloating ? 6 : 18,
                fontSize: isFloating ? 12 : 16,
                color: Colors.textSecondary,
              },
            ]}
          >
            {label}
          </Text>
        ) : null}
        <View style={styles.nativeValueRow}>
          <Text
            style={[
              styles.nativeValueText,
              !hasValue && !label ? styles.nativePlaceholderText : null,
            ]}
            numberOfLines={1}
          >
            {hasValue ? formatForDisplay(value) : label ? "" : placeholder}
          </Text>
          {clearable && hasValue ? (
            <ClearButton onPress={() => onChange("")} />
          ) : (
            <MaterialIcons
              name="calendar-today"
              size={18}
              color={Colors.textSecondary}
              style={styles.trailingIcon}
            />
          )}
        </View>
        <View style={[styles.underline, { backgroundColor: Colors.outline }]} />
      </Pressable>

      {Platform.OS === "ios" && iosPickerOpen ? (
        <Modal transparent animationType="fade">
          <Pressable
            style={styles.iosBackdrop}
            onPress={() => setIosPickerOpen(false)}
          >
            {/* Stop backdrop-press from closing when tapping the sheet. */}
            <Pressable style={styles.iosSheet} onPress={() => {}}>
              <DateTimePicker
                value={iosDraft ?? currentDate}
                mode="date"
                display="inline"
                onChange={(_event, date) => {
                  if (date) setIosDraft(date);
                }}
                themeVariant="dark"
              />
              <View style={styles.iosSheetActions}>
                <Pressable
                  onPress={() => setIosPickerOpen(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.iosSheetCancel}>Cancel</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (iosDraft) onChange(formatYYYYMMDD(iosDraft));
                    setIosPickerOpen(false);
                  }}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.iosSheetDone}>Done</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function ClearButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Clear date"
      style={styles.trailingIcon}
    >
      <MaterialIcons name="close" size={18} color={Colors.textSecondary} />
    </Pressable>
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
  // The whole field opens the picker via showPicker(); hide the
  // browser's own tiny indicator so there aren't two calendar icons.
  cursor: "pointer" as const,
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
    height: 1,
  },
  webInputRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trailingIcon: {
    marginLeft: 8,
    marginBottom: 10,
  },
  nativeValueRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingTop: 22,
    paddingBottom: 8,
    minHeight: FIELD_MIN_HEIGHT,
  },
  nativeValueText: {
    fontSize: 16,
    color: Colors.text,
    flexShrink: 1,
  },
  nativePlaceholderText: {
    color: Colors.textSecondary,
  },
  iosBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  iosSheet: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32,
  },
  iosSheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 24,
    marginTop: 8,
  },
  iosSheetCancel: {
    color: Colors.textSecondary,
    fontSize: 16,
    fontWeight: "600",
  },
  iosSheetDone: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
});
