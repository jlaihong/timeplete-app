import { Radius } from "../../theme/tokens";
import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors, TRACKABLE_COLORS } from "../../constants/colors";

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  colors?: string[];
}

/**
 * A single row of colour swatches. Small enough that the whole palette
 * fits one line of a dialog; the chosen colour gets a ring and a tick, so
 * it reads at a glance rather than by comparing border thickness.
 */
export function ColorPicker({
  selectedColor,
  onColorSelect,
  colors = TRACKABLE_COLORS,
}: ColorPickerProps) {
  // A colour saved before the current palette (or picked elsewhere) is not
  // one of the swatches; show it first so the current choice is visible.
  const inPalette = colors.some(
    (c) => c.toLowerCase() === selectedColor.toLowerCase(),
  );
  const swatches = inPalette || !selectedColor ? colors : [selectedColor, ...colors];
  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      {swatches.map((color) => {
        // Stored colours may differ in case from the palette's.
        const selected = selectedColor.toLowerCase() === color.toLowerCase();
        return (
          <Pressable
            key={color}
            onPress={() => onColorSelect(color)}
            accessibilityRole="radio"
            accessibilityLabel={`Colour ${color}`}
            accessibilityState={{ checked: selected }}
            hitSlop={4}
            style={[styles.ring, selected && styles.ringSelected]}
          >
            <View style={[styles.swatch, { backgroundColor: color }]}>
              {selected ? (
                <Ionicons name="checkmark" size={13} color={Colors.onPrimary} />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    // Tight enough that the palette plus one custom colour fits a dialog row.
    gap: 2,
  },
  // The ring is always there (transparent) so selecting never shifts layout.
  ring: {
    padding: 2,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: "transparent",
  },
  ringSelected: { borderColor: Colors.text },
  swatch: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
});
