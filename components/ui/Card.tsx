import React from "react";
import { View, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { panelStyle, panelPadding } from "../../theme/panels";

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}

/**
 * Shared elevated panel — the React-Native-Web equivalent of
 * productivity-one's default `<mat-card>`. Uses the canonical
 * `panelStyle` from `theme/panels.ts` (surface-container-low + 12px
 * radius + level1 shadow, NO border).
 */
export function Card({ children, style, padded = true }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: panelStyle,
  padded: { padding: panelPadding },
});
