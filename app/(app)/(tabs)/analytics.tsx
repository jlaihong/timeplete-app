import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { AnalyticsPage } from "../../../components/analytics/AnalyticsPage";
import { traceScreenMount } from "../../../lib/navInstrumentation";

export default function AnalyticsScreen() {
  useEffect(() => {
    traceScreenMount("(tabs)/analytics");
  }, []);

  return (
    <View style={styles.container}>
      <AnalyticsPage title="Analytics" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
