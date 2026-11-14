import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useIsDesktop } from "../../hooks/useIsDesktop";

/**
 * Phone only: Analytics and Reviews share the "Insights" tab, and this
 * two-way switch at the top of each moves between them. Desktop reaches
 * both from the sidebar, so it renders nothing there.
 */
export function InsightsSwitch({ active }: { active: "analytics" | "reviews" }) {
  const isDesktop = useIsDesktop();
  if (isDesktop) return null;
  const item = (key: "analytics" | "reviews", label: string) => {
    const selected = key === active;
    return (
      <Pressable
        onPress={() => {
          if (!selected) router.navigate(`/(app)/(tabs)/${key}`);
        }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        style={[styles.item, selected && styles.itemActive]}
      >
        <Text style={[styles.label, selected && styles.labelActive]}>
          {label}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {item("analytics", "Analytics")}
      {item("reviews", "Reviews")}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    padding: 3,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  item: {
    flex: 1,
    height: 36,
    borderRadius: Radius.md - 2,
    alignItems: "center",
    justifyContent: "center",
  },
  itemActive: { backgroundColor: Colors.surfaceContainerLow },
  label: { fontSize: FontSize.body, color: Colors.textSecondary },
  labelActive: { color: Colors.text, fontWeight: "600" },
});
