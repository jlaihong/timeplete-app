/**
 * Small UI atoms shared across the goal-onboarding stepper:
 * checkboxes, labelled inputs, date pickers (web-only `<input type="date">`),
 * and a draggable-rows table for reasons / penalties.
 *
 * These intentionally live alongside the goal flow rather than in
 * `components/ui` because they are shaped to match the angular goal forms
 * specifically (mat-checkbox, mat-form-field, mat-table styling).
 */
import React, { forwardRef, useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  TextInput,
  Platform,
  TextInputProps,
} from "react-native";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import { Input } from "../../ui/Input";
import { DateField as MaterialDateField } from "../../ui/DateField";

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

/**
 * `LabeledField` is a thin layout shell that injects its `label`
 * (and `error`) into the wrapped field via `React.cloneElement` so
 * the child can render the label inside its own filled chrome with
 * the floating-label animation used everywhere else. The field
 * always self-sizes to fit the wider of its label or its inner
 * input — matching productivity-one's `mat-form-field`, which never
 * clips a label even when the input itself is narrow (e.g. a
 * `class="w-12"` 2-digit number input under a "Number of days per
 * week" label).
 *
 * `width` is intentionally NOT forwarded as the outer field width
 * — that was clipping long labels. If you want a narrow visible
 * input box, pass `width` directly on the child (`NumberField` /
 * `TextField`); it sizes only the inner input, while the outer
 * field still expands to fit the label.
 */
export function LabeledField({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactElement;
  error?: string | null;
}) {
  const child = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<any>, {
        label,
        error,
      })
    : children;
  return <View style={styles.fieldContainer}>{child}</View>;
}

/* ──────────────────────────────────────────────────────────────────── */
/* TextField / NumberField — Material-styled inputs                     */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * `TextField` and `NumberField` delegate to the shared `Input`
 * component so they pick up the same Material 3 floating-label
 * appearance used by every other input in the app.
 *
 * `width` controls the inner input box width (matches P1's
 * `class="w-12"` / `class="w-40"` on the `<input>` itself). The
 * outer field auto-sizes to fit the wider of the label or input,
 * so a narrow input under a long label never clips the label.
 */
interface BaseFieldProps extends Omit<TextInputProps, "style"> {
  width?: number | string;
  label?: string;
  error?: string | null;
}

export const TextField = forwardRef<TextInput, BaseFieldProps>(
  function TextField({ width, label, error, ...props }, ref) {
    return (
      <Input
        ref={ref as any}
        label={label}
        error={error ?? undefined}
        // Default to filling the parent field (which itself sits in a
        // grid cell, see `LabeledField`). Callers can pin the input
        // narrower by passing an explicit `width`. Numeric inputs use
        // `NumberField`, which has its own small default.
        style={{ width: (width as any) ?? "100%" }}
        containerStyle={{ marginBottom: 0 }}
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
  width = 64,
  label,
  error,
  helperText,
  ...rest
}: {
  value: number | undefined;
  onChange: (n: number | undefined) => void;
  min?: number;
  max?: number;
  /**
   * Width of the visible input box (matches P1's `class="w-12"`).
   * The outer field expands beyond this to fit the label.
   */
  width?: number;
  label?: string;
  error?: string | null;
  /**
   * Hint copy rendered as a Material-style hint inside the input's
   * chrome (immediately under the underline). Tighter and more
   * consistent than placing free-floating helper `<Text>` siblings.
   */
  helperText?: string;
} & Omit<TextInputProps, "value" | "onChange" | "onChangeText">) {
  return (
    <Input
      label={label}
      error={error ?? undefined}
      helperText={helperText}
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
      style={{ width }}
      containerStyle={{ marginBottom: 0 }}
      {...rest}
    />
  );
}

/* ──────────────────────────────────────────────────────────────────── */
/* DateField — Material-styled wrapper around `<input type="date">`.    */
/* ──────────────────────────────────────────────────────────────────── */

/**
 * Delegates to the shared `MaterialDateField` so the goal-onboarding
 * date pickers match the rest of the app (filled background, animated
 * underline, floating label). The `label` (and `error`) come from
 * `LabeledField` via `cloneElement`.
 *
 * The shared `MaterialDateField` self-sizes to fit its label, so we
 * don't accept (or forward) a width prop here — wrapping it in a
 * fixed-width View would just clip long labels again.
 */
export function DateField({
  value,
  onChange,
  label,
}: {
  /** YYYYMMDD or empty string */
  value: string;
  onChange: (yyyymmdd: string) => void;
  label?: string;
}) {
  return <MaterialDateField value={value} onChange={onChange} label={label} />;
}

const isWeb = Platform.OS === "web";

function generateRowId(): string {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `row-${Math.random().toString(36).slice(2, 11)}`;
}

/* ──────────────────────────────────────────────────────────────────── */
/* DraggableTextList — reasons / penalties rows with reorder.            *
 * Web: @dnd-kit sortable (same stack as DesktopTaskList); drag handle   *
 * only so text fields stay editable.                                    *
 * Native: no DOM for dnd-kit — up/down controls beside the grip.        */
/* ──────────────────────────────────────────────────────────────────── */

function WebSortableRow({
  id,
  value,
  index,
  items,
  onItemsChange,
  onDeleteRow,
  placeholder,
  addLabel,
}: {
  id: string;
  value: string;
  index: number;
  items: string[];
  onItemsChange: (next: string[]) => void;
  onDeleteRow: () => void;
  placeholder: string;
  addLabel: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: 6,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        {...attributes}
        {...listeners}
        style={{
          width: 28,
          minHeight: 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          touchAction: "none",
          cursor: isDragging ? "grabbing" : "grab",
          borderRadius: 6,
        }}
      >
        <MaterialIcons
          name="drag-indicator"
          size={20}
          color={Colors.textTertiary}
        />
      </div>
      <TextInput
        value={value}
        onChangeText={(s) => {
          const next = [...items];
          next[index] = s;
          onItemsChange(next);
        }}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        multiline
        style={[styles.listInput, { flex: 1 }]}
      />
      <Pressable
        onPress={onDeleteRow}
        style={styles.iconBtn}
        accessibilityLabel={`Delete ${addLabel.toLowerCase()}`}
      >
        <MaterialIcons name="delete" size={20} color={Colors.textSecondary} />
      </Pressable>
    </div>
  );
}

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
  const [sortIds, setSortIds] = useState<string[]>(() =>
    items.map(() => generateRowId())
  );

  useEffect(() => {
    setSortIds((prev) => {
      if (prev.length === items.length) return prev;
      return Array.from({ length: items.length }, () => generateRowId());
    });
  }, [items.length]);

  const handleAdd = useCallback(() => {
    setSortIds((ids) => [...ids, generateRowId()]);
    onAdd();
  }, [onAdd]);

  const handleDeleteRow = useCallback(
    (index: number) => {
      setSortIds((ids) => ids.filter((_, j) => j !== index));
      onChange(items.filter((_, j) => j !== index));
    },
    [items, onChange]
  );

  const moveRow = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= items.length) return;
      setSortIds((ids) => arrayMove(ids, from, to));
      onChange(arrayMove(items, from, to));
    },
    [items, onChange]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = sortIds.indexOf(String(active.id));
      const newIndex = sortIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      setSortIds((ids) => arrayMove(ids, oldIndex, newIndex));
      onChange(arrayMove(items, oldIndex, newIndex));
    },
    [items, onChange, sortIds]
  );

  const listFooter = (
    <Pressable onPress={handleAdd} style={styles.addBtn}>
      <MaterialIcons name="add" size={18} color={Colors.primary} />
      <Text style={styles.addBtnText}>{addLabel}</Text>
    </Pressable>
  );

  if (isWeb) {
    return (
      <View style={styles.list}>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={sortIds} strategy={verticalListSortingStrategy}>
            {items.map((item, i) => (
              <WebSortableRow
                key={sortIds[i] ?? String(i)}
                id={sortIds[i]!}
                value={item}
                index={i}
                items={items}
                onItemsChange={onChange}
                onDeleteRow={() => handleDeleteRow(i)}
                placeholder={placeholder}
                addLabel={addLabel}
              />
            ))}
          </SortableContext>
        </DndContext>
        {listFooter}
      </View>
    );
  }

  return (
    <View style={styles.list}>
      {items.map((item, i) => (
        <View key={sortIds[i] ?? String(i)} style={styles.listRow}>
          <View style={styles.nativeReorderCol}>
            <Pressable
              onPress={() => moveRow(i, i - 1)}
              disabled={i === 0}
              style={[
                styles.reorderNudge,
                i === 0 && styles.reorderNudgeDisabled,
              ]}
              accessibilityLabel="Move row up"
            >
              <MaterialIcons
                name="keyboard-arrow-up"
                size={22}
                color={i === 0 ? Colors.textTertiary : Colors.textSecondary}
              />
            </Pressable>
            <MaterialIcons
              name="drag-indicator"
              size={20}
              color={Colors.textTertiary}
              style={{ opacity: 0.35 }}
            />
            <Pressable
              onPress={() => moveRow(i, i + 1)}
              disabled={i >= items.length - 1}
              style={[
                styles.reorderNudge,
                i >= items.length - 1 && styles.reorderNudgeDisabled,
              ]}
              accessibilityLabel="Move row down"
            >
              <MaterialIcons
                name="keyboard-arrow-down"
                size={22}
                color={
                  i >= items.length - 1
                    ? Colors.textTertiary
                    : Colors.textSecondary
                }
              />
            </Pressable>
          </View>
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
            onPress={() => handleDeleteRow(i)}
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
      {listFooter}
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
  fieldContainer: {
    // Behave as a uniform grid cell: every LabeledField in the same
    // flex-row tries to be `flexBasis` wide, grows to share leftover
    // space evenly, and wraps to its own row once the container
    // narrower than `minWidth * 2 + gap`. Combined with the row
    // styles in CommitmentForms (flex-direction: row, flex-wrap:
    // wrap), this gives the 2-up grid on desktop and a single
    // column on mobile/narrow dialogs.
    gap: 6,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 220,
    minWidth: 220,
  },
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
  nativeReorderCol: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 2,
    width: 28,
  },
  reorderNudge: {
    paddingVertical: 1,
    paddingHorizontal: 2,
    borderRadius: 4,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  reorderNudgeDisabled: { opacity: 0.35 },
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
