import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { ReviewPanel } from "../../../components/shared/ReviewPanel";

export default function ReviewsScreen() {
  return (
    <View style={styles.container}>
      <ReviewPanel />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
