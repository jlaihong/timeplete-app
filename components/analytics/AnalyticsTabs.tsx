import { FontSize, Radius } from "../../theme/tokens";
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../../constants/colors";
import {
  ANALYTICS_TABS,
  AnalyticsTab,
  useAnalyticsState,
} from "./AnalyticsState";

export function AnalyticsTabs({ inline = false }: { inline?: boolean }) {
  const { selectedTab, setTab } = useAnalyticsState();

  return (
    <View style={[styles.row, inline && styles.rowInline]}>
      {ANALYTICS_TABS.map((t) => {
        const active = selectedTab === t.id;
        return (
          <TouchableOpacity
            key={t.id}
            onPress={() => setTab(t.id as AnalyticsTab)}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.label, active && styles.labelActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // A segmented control: one quiet track, the chosen period raised on it.
  // The accent colour is left for the data below.
  row: {
    flexDirection: "row",
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginTop: 12,
    padding: 3,
    gap: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainer,
  },
  rowInline: { marginHorizontal: 0, marginTop: 0, alignSelf: "center" },
  tab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
  },
  tabActive: { backgroundColor: Colors.surfaceContainerHighest },
  label: { fontSize: FontSize.body, fontWeight: "600", color: Colors.textSecondary },
  labelActive: { color: Colors.text },
});
