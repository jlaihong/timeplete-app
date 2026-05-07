import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { AnalyticsPage } from "../../../components/analytics/AnalyticsPage";
import { useRegisterDesktopSubtitle } from "../../../components/layout/DesktopAppChrome";

export default function AnalyticsScreen() {
  useRegisterDesktopSubtitle("Analytics");
  return (
    <View style={styles.container}>
      <AnalyticsPage title="Analytics" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
