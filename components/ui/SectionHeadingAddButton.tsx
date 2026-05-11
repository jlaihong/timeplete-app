import React from "react";
import {
  Pressable,
  Platform,
  StyleSheet,
  type PressableStateCallbackType,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

export type SectionHeadingAddButtonTone = "default" | "onInverse";

/**
 * Inline “+” for section headers and the same pattern anywhere we add entities
 * (plain `add` glyph, padded hit target, web hover). Use `tone="onInverse"`
 * on saturated banners (e.g. productivity-one blue strip).
 */
export function SectionHeadingAddButton({
  onPress,
  accessibilityLabel,
  tone = "default",
  iconColor: iconColorProp,
  hitSlop = 8,
}: {
  onPress: () => void;
  accessibilityLabel: string;
  tone?: SectionHeadingAddButtonTone;
  /** When set, overrides the colour implied by `tone`. */
  iconColor?: string;
  hitSlop?: number;
}) {
  const iconColor =
    iconColorProp ??
    (tone === "onInverse" ? Colors.white : Colors.primary);

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
        return [
          styles.root,
          hovered &&
            (tone === "onInverse" ? styles.hoverInverse : styles.hover),
        ];
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={hitSlop}
    >
      <Ionicons name="add" size={24} color={iconColor} />
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
  hoverInverse: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
});
