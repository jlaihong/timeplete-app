import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { TrackableList } from "../../../components/shared/TrackableList";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

export default function GoalsScreen() {
  const isDesktop = useIsDesktop();

  return (
    <View style={styles.container}>
      <TrackableList title={isDesktop ? "Trackables" : undefined} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
