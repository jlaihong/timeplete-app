import { FontSize, Radius } from "../../theme/tokens";
import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  ScrollView,
  Modal,
  Platform,
} from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { useAuth } from "../../hooks/useAuth";
import { useRegisterEscapeClose } from "../../hooks/useRegisterEscapeClose";

export interface ListPickerProps {
  /**
   * Currently assigned list id (or `null`/`undefined` for "no manual list",
   * which we render as "Inbox").
   */
  value: Id<"lists"> | null | undefined;
  onChange: (id: Id<"lists"> | null) => void;
  label?: string;
  /**
   * In `add` mode, the empty option was once labelled "None" (matching
   * productivity-one's `AddTask` mat-select); in `edit` mode it is the
   * literal Inbox list, labelled "Inbox" (matching `TaskDetails`).
   */
  mode?: "add" | "edit";
  /** Disable the trigger (e.g. when the list is locked by context). */
  disabled?: boolean;
}

/**
 * Field for assigning a task to a list. Mirrors productivity-one's
 * `<mat-select>` with `<mat-label>List</mat-label>` in both
 * `add-task.html` and `task-details.html`.
 *
 * Filtering rules (verbatim from `availableLists()`):
 *   - exclude `isGoalList` (lists that back a trackable)
 *   - exclude `isInbox` (rendered as a separate explicit option)
 *   - exclude archived lists
 *
 * The dropdown menu is rendered via React Native's `Modal` (which
 * portals to `document.body` on web), so it escapes the parent dialog's
 * stacking context and never gets covered by sibling controls like the
 * Delete button below it.
 */
export function ListPicker({
  value,
  onChange,
  label = "List",
  mode = "add",
  disabled,
}: ListPickerProps) {
  const { profileReady } = useAuth();
  const [open, setOpen] = useState(false);
  useRegisterEscapeClose(() => setOpen(false), open);
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");

  const inboxList = useMemo(
    () => lists?.find((l) => l.isInbox) ?? null,
    [lists]
  );
  const availableLists = useMemo(
    () =>
      (lists ?? []).filter(
        (l) => !l.isGoalList && !l.isInbox && !l.archived
      ),
    [lists]
  );

  // Resolve what the trigger should display:
  //   - non-null id pointing at a real list → that list's name + colour
  //   - non-null id pointing at the inbox → "Inbox" (edit mode shows it
  //     explicitly; add mode just shows nothing)
  //   - null/undefined → "Inbox" in edit mode, "None" in add mode
  const selectedNonInbox = availableLists.find((l) => l._id === value);
  const isInboxSelected =
    value != null && inboxList != null && value === inboxList._id;

  const triggerLabel = selectedNonInbox
    ? selectedNonInbox.name
    : isInboxSelected || value == null
      ? "Inbox"
      : "";

  const triggerColour =
    selectedNonInbox?.colour ??
    (isInboxSelected || value == null ? null : null);

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <TouchableOpacity
        style={[styles.trigger, disabled && styles.triggerDisabled]}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityLabel={`${label} picker`}
      >
        <View style={styles.triggerInner}>
          {triggerColour ? (
            <View
              style={[styles.colourDot, { backgroundColor: triggerColour }]}
            />
          ) : (
            <View style={styles.colourDotEmpty} />
          )}
          <Text style={styles.triggerText} numberOfLines={1}>
            {triggerLabel}
          </Text>
        </View>
        <Ionicons name="chevron-down" size={16} color={Colors.textSecondary} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable
            style={styles.menu}
            onPress={(e) => e.stopPropagation?.()}
          >
            <ScrollView style={styles.menuScroll}>
              {/* Default row: always labelled "Inbox" — an unassigned task
                  is saved to the Inbox list in both add and edit mode. */}
              <TouchableOpacity
                style={styles.menuItem}
                onPress={() => {
                  // In edit mode, picking "Inbox" sets the actual inbox id
                  // so the task lives on the Inbox list (matching P1's
                  // `getEffectiveListId` fallback). In add mode "None"
                  // means clear; the parent's onSave will default to inbox.
                  onChange(
                    mode === "edit" ? (inboxList?._id ?? null) : null
                  );
                  setOpen(false);
                }}
              >
                <View style={styles.colourDotEmpty} />
                <Text style={styles.menuItemText}>
                  Inbox
                </Text>
                {(value == null || isInboxSelected) && (
                  <Ionicons
                    name="checkmark"
                    size={16}
                    color={Colors.primary}
                  />
                )}
              </TouchableOpacity>

              {availableLists.map((l) => {
                const isSelected = value === l._id;
                return (
                  <TouchableOpacity
                    key={l._id}
                    style={styles.menuItem}
                    onPress={() => {
                      onChange(l._id);
                      setOpen(false);
                    }}
                  >
                    <View
                      style={[styles.colourDot, { backgroundColor: l.colour }]}
                    />
                    <Text style={styles.menuItemText} numberOfLines={1}>
                      {l.name}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark"
                        size={16}
                        color={Colors.primary}
                      />
                    )}
                  </TouchableOpacity>
                );
              })}

              {lists && availableLists.length === 0 && (
                <Text style={styles.emptyText}>
                  No lists yet — create one from the Lists screen.
                </Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  label: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    marginBottom: 6,
    fontWeight: "600",
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainer,
    gap: 8,
  },
  triggerDisabled: { opacity: 0.5 },
  triggerInner: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  triggerText: { fontSize: FontSize.body, color: Colors.text, flex: 1 },
  colourDot: { width: 12, height: 12, borderRadius: Radius.sm },
  colourDotEmpty: {
    width: 12,
    height: 12,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  menu: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    width: "100%",
    maxWidth: 360,
    maxHeight: 400,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  menuScroll: { padding: 8 },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  menuItemText: { flex: 1, fontSize: FontSize.body, color: Colors.text },
  emptyText: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    padding: 16,
    textAlign: "center",
  },
});
