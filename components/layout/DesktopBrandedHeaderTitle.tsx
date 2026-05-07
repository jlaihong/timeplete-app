import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";

/**
 * Desktop-only header title: brand on the left, optional context to the right.
 * Omit `subtitle` when only the app name should show.
 */
export function DesktopBrandedHeaderTitle({
  subtitle,
}: {
  subtitle?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.brand}>Timeplete</Text>
      {subtitle ? (
        <Text
          style={styles.subtitle}
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    paddingRight: 8,
    flex: 1,
    minWidth: 0,
  },
  brand: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 20,
    fontWeight: "500",
    color: Colors.textSecondary,
    letterSpacing: -0.2,
    marginLeft: 10,
    flexShrink: 1,
  },
});
