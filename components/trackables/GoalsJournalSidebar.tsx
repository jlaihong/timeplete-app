import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Colors } from "../../constants/colors";

/**
 * Narrow-column companion matching productivity-one's Bootstrap Journal rail:
 * magenta strip header (`JournalComponent.tsx`) plus scroll body beneath — NOT a calendar.
 * Journal authoring isn't ported yet; body carries lightweight parity placeholder copy.
 */
export function GoalsJournalSidebar() {
  return (
    <View style={styles.root}>
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Journal</Text>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollInner}
        showsVerticalScrollIndicator
      >
        <Text style={styles.placeholder}>
          Free-form journal templates live here in productivity-one. In Timeplete
          they will attach once journaling ships — layout rails mirror that shell today.
        </Text>
      </ScrollView>
    </View>
  );
}

/** Header magenta matches `#E829B2` from productivity-one `JournalComponent.tsx`. */
const P_ONE_JOURNAL_MAGENTA = "#E829B2";

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: Colors.surfaceContainerLow,
  },
  banner: {
    backgroundColor: P_ONE_JOURNAL_MAGENTA,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerTitle: {
    color: Colors.white,
    fontSize: 22,
    fontWeight: "600",
  },
  scroll: { flex: 1 },
  scrollInner: {
    padding: 16,
    paddingBottom: 24,
  },
  placeholder: {
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
});
