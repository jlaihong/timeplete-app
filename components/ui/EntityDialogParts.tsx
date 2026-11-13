/**
 * Pieces shared by the list and tag dialogs, so the two look and behave
 * alike: the name is the dialog's title (edited in place), the colour is
 * the dot beside it, and each setting is one row with its label on the
 * left and its control on the right.
 */
import React, { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { ColorPicker } from "./ColorPicker";

export function EntityTitle({
  name,
  onNameChange,
  onNameCommit,
  placeholder,
  nameEditable = true,
  autoFocus = false,
  colour,
  onColourChange,
  headerActions,
  onClose,
}: {
  name: string;
  onNameChange: (text: string) => void;
  /** Leaving the field or pressing Enter. */
  onNameCommit?: () => void;
  placeholder: string;
  nameEditable?: boolean;
  autoFocus?: boolean;
  colour: string;
  /** When set, the dot opens a palette. Omit to show the dot only. */
  onColourChange?: (colour: string) => void;
  headerActions?: React.ReactNode;
  onClose: () => void;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [focused, setFocused] = useState(false);

  const dot = <View style={[styles.dot, { backgroundColor: colour }]} />;

  return (
    <View style={styles.header}>
      {onColourChange ? (
        <Pressable
          onPress={() => setPaletteOpen((o) => !o)}
          accessibilityRole="button"
          accessibilityLabel="Change colour"
          accessibilityState={{ expanded: paletteOpen }}
          hitSlop={4}
          style={(state) => [
            styles.dotButton,
            ((state as { hovered?: boolean }).hovered ||
              state.pressed ||
              paletteOpen) &&
              styles.dotButtonActive,
          ]}
        >
          {dot}
        </Pressable>
      ) : (
        <View style={styles.dotButton}>{dot}</View>
      )}

      <TextInput
        value={name}
        onChangeText={onNameChange}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          onNameCommit?.();
        }}
        onSubmitEditing={onNameCommit}
        editable={nameEditable}
        autoFocus={autoFocus}
        placeholder={placeholder}
        placeholderTextColor={Colors.textTertiary}
        accessibilityLabel="Name"
        returnKeyType="done"
        style={[
          styles.name,
          nameEditable && focused && styles.nameFocused,
          Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
        ]}
      />

      <View style={styles.headerRight}>
        {headerActions}
        <Pressable
          onPress={onClose}
          style={styles.iconBtn}
          accessibilityLabel="Close dialog"
          hitSlop={8}
        >
          <MaterialIcons name="close" size={20} color={Colors.text} />
        </Pressable>
      </View>

      {paletteOpen && onColourChange ? (
        <>
          <Pressable
            style={styles.catcher}
            onPress={() => setPaletteOpen(false)}
            accessibilityLabel="Close colours"
          />
          <View style={styles.palette}>
            <ColorPicker
              selectedColor={colour}
              onColorSelect={(c) => {
                onColourChange(c);
                setPaletteOpen(false);
              }}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

/** One setting: label (and an optional quiet note) left, control right. */
export function SettingRow({
  label,
  note,
  children,
}: {
  label: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {note ? <Text style={styles.rowNote}>{note}</Text> : null}
      </View>
      <View style={styles.rowControl}>{children}</View>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

/** A save that failed, said under the settings rather than in an alert. */
export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Text style={styles.error}>{message}</Text>;
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
    minHeight: 36,
    // Above the body, so the palette and the menu can drop over it.
    zIndex: 10,
    flexShrink: 0,
  },
  dotButton: {
    width: 28,
    height: 28,
    marginLeft: -6,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dotButtonActive: { backgroundColor: Colors.surfaceContainerHighest },
  dot: { width: 14, height: 14, borderRadius: Radius.pill },
  name: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.title,
    fontWeight: "600",
    color: Colors.text,
    paddingVertical: 4,
    paddingHorizontal: 6,
    marginLeft: -2,
    borderRadius: Radius.sm,
  },
  nameFocused: { backgroundColor: Colors.surfaceContainer },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  catcher: {
    position: "absolute",
    top: -2000,
    left: -2000,
    right: -2000,
    bottom: -2000,
    ...Platform.select({
      web: { cursor: "default" } as object,
      default: {},
    }),
  },
  palette: {
    position: "absolute",
    top: 40,
    left: -6,
    padding: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.45)" } as object,
      default: { elevation: 8 },
    }),
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    minHeight: 48,
  },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowLabel: { fontSize: FontSize.body, color: Colors.text },
  rowNote: { fontSize: FontSize.caption, color: Colors.textTertiary },
  rowControl: { flexShrink: 0, alignItems: "flex-end" },

  sectionLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.textTertiary,
    marginTop: 16,
    marginBottom: 4,
  },
  error: { fontSize: FontSize.caption, color: Colors.error, marginTop: 8 },
});
