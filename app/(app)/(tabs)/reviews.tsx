import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { ReviewPanel } from "../../../components/shared/ReviewPanel";
import { useRegisterDesktopSubtitle } from "../../../components/layout/DesktopAppChrome";

export default function ReviewsScreen() {
  useRegisterDesktopSubtitle("Reviews");
  return (
    <View style={styles.container}>
      <ReviewPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
