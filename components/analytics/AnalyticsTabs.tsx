import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../../constants/colors";
import {
  ANALYTICS_TABS,
  AnalyticsTab,
  useAnalyticsState,
} from "./AnalyticsState";

export function AnalyticsTabs() {
  const { selectedTab, setTab } = useAnalyticsState();

  return (
    <View style={styles.row}>
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
  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
    flexWrap: "wrap",
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.surfaceVariant,
  },
  tabActive: { backgroundColor: Colors.primary },
  label: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  labelActive: { color: Colors.onPrimary },
});
