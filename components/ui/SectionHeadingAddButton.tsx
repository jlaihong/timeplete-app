import React from "react";
import {
  Pressable,
  Platform,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

/**
 * Matches list detail section headers (`ListDetailWebDnd`): plain “add” glyph,
 * primary colour, circular hover affordance on web.
 */
export function SectionHeadingAddButton({
  onPress,
  accessibilityLabel,
}: {
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={(e) => {
        (e as { stopPropagation?: () => void })?.stopPropagation?.();
        onPress();
      }}
      style={(state) => {
        const { hovered } = state as PressableStateCallbackType & {
          hovered?: boolean;
        };
        return [styles.root, hovered && styles.hover];
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      <Ionicons name="add" size={24} color={Colors.primary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 6,
    borderRadius: 20,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  hover: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
});
