import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";

/** Desktop-only: app name in the header, below the screen title line. */
export function DesktopBrandedHeaderTitle({
  subtitle,
}: {
  subtitle: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.subtitle}>{subtitle}</Text>
      <Text style={styles.brand}>Timeplete</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { justifyContent: "center" },
  subtitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.text,
    lineHeight: 22,
  },
  brand: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    letterSpacing: 0.2,
    textTransform: "uppercase",
    marginTop: 2,
  },
});
