import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { AnalyticsPage } from "../../../components/analytics/AnalyticsPage";
export default function AnalyticsScreen() {
  return (
    <View style={styles.container}>
      <AnalyticsPage title="Analytics" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
