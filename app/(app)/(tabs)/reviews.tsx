import React from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { ReviewPanel } from "../../../components/shared/ReviewPanel";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../../components/layout/DesktopPageHeader";

export default function ReviewsScreen() {
  return (
    <View style={styles.container}>
      <DesktopPageHeader title="Reviews" column />
      {/* Centred column, so answers stay a readable line length. */}
      <View style={styles.body}>
        <ReviewPanel />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1, minHeight: 0, ...pageColumnStyle },
});
