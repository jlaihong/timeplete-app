import React from "react";
import { View, TouchableOpacity, StyleSheet, Platform } from "react-native";
import { TRACKABLE_COLORS } from "../../constants/colors";

interface ColorPickerProps {
  selectedColor: string;
  onColorSelect: (color: string) => void;
  colors?: string[];
}

export function ColorPicker({
  selectedColor,
  onColorSelect,
  colors = TRACKABLE_COLORS,
}: ColorPickerProps) {
  return (
    <View style={styles.container}>
      {colors.map((color) => (
        <TouchableOpacity
          key={color}
          style={[
            styles.swatch,
            { backgroundColor: color },
            selectedColor === color && styles.selected,
          ]}
          onPress={() => onColorSelect(color)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  selected: {
    borderWidth: 3,
    borderColor: "#FFFFFF",
    elevation: 4,
    ...Platform.select({
      web: { boxShadow: "0 2px 3px rgba(0,0,0,0.3)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 3,
      },
    }),
  },
});
