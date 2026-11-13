import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";

export interface EntityRowAction {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}

/**
 * One row of a management list (Lists, Tags): a colour dot, a name, an
 * optional quiet note, and a few icon actions. Flat, with a hairline
 * divider — the same language as the task rows — not a boxed card per row.
 */
export function EntityRow({
  colour,
  name,
  note,
  onPress,
  pressLabel,
  actions = [],
  showGrip = false,
  showChevron = false,
}: {
  colour: string;
  name: string;
  /** Quiet text after the name, e.g. "Trackable". */
  note?: string;
  onPress: () => void;
  pressLabel: string;
  actions?: EntityRowAction[];
  /** Show the drag grip (only where rows can be dragged). */
  showGrip?: boolean;
  showChevron?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={pressLabel}
      style={(state) => [
        styles.row,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.rowHover,
      ]}
    >
      {showGrip ? (
        <Ionicons
          name="reorder-two-outline"
          size={16}
          color={Colors.textTertiary}
          style={styles.grip}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={styles.name} numberOfLines={1}>
        {name}
      </Text>
      {note ? (
        <Text style={styles.note} numberOfLines={1}>
          {note}
        </Text>
      ) : null}
      <View style={styles.spacer} />
      {actions.map((action) => (
        <Pressable
          key={action.label}
          onPress={(e) => {
            (e as { stopPropagation?: () => void })?.stopPropagation?.();
            action.onPress();
          }}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={6}
          style={(state) => [
            styles.action,
            ((state as { hovered?: boolean }).hovered || state.pressed) &&
              styles.actionHover,
          ]}
        >
          <Ionicons name={action.icon} size={17} color={Colors.textSecondary} />
        </Pressable>
      ))}
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.textTertiary}
        />
      ) : null}
    </Pressable>
  );
}

/** Quiet heading above a group of rows. */
export function EntityGroupHeading({
  title,
  count,
}: {
  title: string;
  count?: number;
}) {
  return (
    <Text style={styles.groupHeading}>
      {title}
      {count != null ? `  ${count}` : ""}
    </Text>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
    ...Platform.select({
      web: { userSelect: "none" } as object,
      default: {},
    }),
  },
  rowHover: { backgroundColor: Colors.surfaceContainerLow },
  grip: { marginRight: -2 },
  dot: { width: 8, height: 8, borderRadius: Radius.pill, flexShrink: 0 },
  name: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  note: { fontSize: FontSize.caption, color: Colors.textTertiary },
  spacer: { flex: 1 },
  action: {
    width: 30,
    height: 30,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  actionHover: { backgroundColor: Colors.surfaceContainerHigh },
  groupHeading: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
    paddingHorizontal: 8,
    marginTop: 20,
    marginBottom: 6,
  },
});
