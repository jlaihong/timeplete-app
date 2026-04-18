import React from "react";
import { View, StyleSheet, Platform, ViewStyle } from "react-native";
import { Colors } from "../../constants/colors";

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export function Card({ children, style, padded = true }: CardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.borderLight,
    elevation: 2,
    ...Platform.select({
      web: { boxShadow: "0 1px 3px rgba(0,0,0,0.05)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
    }),
  },
  padded: {
    padding: 16,
  },
});
