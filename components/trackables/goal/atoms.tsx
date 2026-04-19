/**
 * Small UI atoms shared across the goal-onboarding stepper:
 * checkboxes, labelled inputs, date pickers (web-only `<input type="date">`),
 * and a draggable-rows table for reasons / penalties.
 *
 * These intentionally live alongside the goal flow rather than in
 * `components/ui` because they are shaped to match the angular goal forms
 * specifically (mat-checkbox, mat-form-field, mat-table styling).
 */
import React from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  TextInputProps,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import { yyyymmddToIsoDate, isoDateToYyyymmdd } from "../../../lib/dates";

/* ──────────────────────────────────────────────────────────────────── */
/* CheckboxRow — port of `<mat-checkbox>`                               */
/* ──────────────────────────────────────────────────────────────────── */

export function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable onPress={onToggle} style={styles.checkboxRow}>
      <View style={[styles.checkboxBox, checked && styles.checkboxBoxChecked]}>
        {checked && (
          <MaterialIcons name="check" size={16} color={Colors.onPrimary} />
        )}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* LabeledField — port of `<mat-form-field>` floating label             */
/* ──────────────────────────────────────────────────────────────────── */

export function LabeledField({
  label,
  children,
  width,
  error,
}: {
  label: string;
  children: React.ReactNode;
  width?: number | string;
  error?: string | null;
}) {
  return (
    <View style={[styles.fieldContainer, width !== undefined && { width: width as any }]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* TextField / NumberField — Material-styled inputs                     */
/* ──────────────────────────────────────────────────────────────────── */

interface BaseFieldProps extends Omit<TextInputProps, "style"> {
  width?: number | string;
}

export const TextField = React.forwardRef<TextInput, BaseFieldProps>(
  function TextField({ width, ...props }, ref) {
    return (
      <TextInput
        ref={ref}
        placeholderTextColor={Colors.textTertiary}
        style={[styles.textInput, width !== undefined && { width: width as any }]}
        {...props}
      />
    );
  }
);

export function NumberField({
  value,
  onChange,
  min,
  max,
  width = 80,
  ...rest
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  width?: number;
} & Omit<TextInputProps, "value" | "onChange" | "onChangeText">) {
  return (
    <TextInput
      value={value === undefined ? "" : String(value)}
      onChangeText={(s) => {
        if (s === "") {
          onChange(undefined);
          return;
        }
        const cleaned = s.replace(/[^\d-]/g, "");
        const n = parseInt(cleaned, 10);
        if (Number.isNaN(n)) {
          onChange(undefined);
          return;
        }
        let bounded = n;
        if (min !== undefined && bounded < min) bounded = min;
        if (max !== undefined && bounded > max) bounded = max;
        onChange(bounded);
      }}
      keyboardType="number-pad"
      inputMode="numeric"
      placeholderTextColor={Colors.textTertiary}
      style={[styles.textInput, { width }]}
      {...rest}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* DateField — `<input type="date">` on web, plain text fallback else.  */
/* ──────────────────────────────────────────────────────────────────── */

export function DateField({
  value,
  onChange,
}: {
  /** YYYYMMDD or empty string */
  value: string;
  onChange: (yyyymmdd: string) => void;
}) {
  if (Platform.OS === "web") {
    return (
      <input
        type="date"
        value={yyyymmddToIsoDate(value)}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          onChange(v ? isoDateToYyyymmdd(v) : "");
        }}
        style={{
          backgroundColor: Colors.surfaceContainer,
          color: Colors.text,
          border: `1px solid ${Colors.outlineVariant}`,
          borderRadius: 8,
          padding: "10px 12px",
          fontSize: 14,
          fontFamily: "inherit",
          minWidth: 150,
        }}
      />
    );
  }
  // Native fallback: text entry. Productivity-one uses Material datepicker;
  // a true mobile picker can be wired in later — desktop web is the focus.
  return (
    <TextInput
      value={yyyymmddToIsoDate(value)}
      placeholder="YYYY-MM-DD"
      placeholderTextColor={Colors.textTertiary}
      onChangeText={(s) => onChange(s.length === 10 ? isoDateToYyyymmdd(s) : "")}
      style={[styles.textInput, { minWidth: 150 }]}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* DraggableTextList — port of the reasons/penalty `mat-table` list.    *
 * Drag-reorder is omitted (productivity-one uses cdkDrag); we keep the *
 * row + delete + "Add ..." button affordances which are the parity-    *
 * critical interactions.                                               */
/* ──────────────────────────────────────────────────────────────────── */

export function DraggableTextList({
  items,
  onChange,
  onAdd,
  addLabel,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  onAdd: () => void;
  addLabel: string;
  placeholder: string;
}) {
  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={i} style={styles.listRow}>
          <MaterialIcons
            name="drag-indicator"
            size={20}
            color={Colors.textTertiary}
            style={{ width: 24 }}
          />
          <TextInput
            value={item}
            onChangeText={(s) => {
              const next = [...items];
              next[i] = s;
              onChange(next);
            }}
            placeholder={placeholder}
            placeholderTextColor={Colors.textTertiary}
            multiline
            style={styles.listInput}
          />
          <Pressable
            onPress={() => {
              const next = items.filter((_, j) => j !== i);
              onChange(next);
            }}
            style={styles.iconBtn}
            accessibilityLabel={`Delete ${addLabel.toLowerCase()}`}
          >
            <MaterialIcons
              name="delete"
              size={20}
              color={Colors.textSecondary}
            />
          </Pressable>
        </View>
      ))}
      <Pressable onPress={onAdd} style={styles.addBtn}>
        <MaterialIcons name="add" size={18} color={Colors.primary} />
        <Text style={styles.addBtnText}>{addLabel}</Text>
      </Pressable>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  /* checkbox */
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
    ...Platform.select({
      web: { cursor: "pointer", userSelect: "none" } as any,
      default: {},
    }),
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  checkboxBoxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 14,
    color: Colors.text,
  },
  /* labeled field */
  fieldContainer: { gap: 6 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  fieldError: { fontSize: 12, color: Colors.error, marginTop: 2 },
  /* text input */
  textInput: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  /* draggable list */
  list: { gap: 6 },
  listRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  listInput: {
    flex: 1,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
    minHeight: 36,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
    borderRadius: 6,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  addBtnText: { fontSize: 14, fontWeight: "500", color: Colors.primary },
});
