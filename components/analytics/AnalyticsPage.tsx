import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { Colors } from "../../constants/colors";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { AnalyticsStateProvider } from "./AnalyticsState";
import { AnalyticsTabs } from "./AnalyticsTabs";
import { AnalyticsDateNavigator } from "./AnalyticsDateNavigator";
import { TrackableProgressionSection } from "./sections/TrackableProgressionSection";
import { TimeBreakdownSection } from "./sections/TimeBreakdownSection";
import { TimeSpendSection } from "./sections/TimeSpendSection";
import { ReviewSection } from "./sections/ReviewSection";

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsPage — productivity-one's `analytics-page` shell.
 *
 *  - Single state provider at the root (selectedTab + selectedDate)
 *  - Tab bar
 *  - Date navigator (hides picker on Yearly)
 *  - 4 sections that ALL consume the same dataset via
 *    `useAnalyticsDataset()`. Switching tab or date triggers a single
 *    Convex re-query and re-renders all 4 sections together.
 *
 * Layout: row of four columns from `md+` (≥1280px), single-column
 * stack on narrow viewports. Matches P1's `flex flex-col md:flex-row
 * gap-4`.
 *
 * Note: there is no `TrackableDialogHost` mounted here — analytics
 * widgets are intentionally read-only (header `open_in_new` only;
 * the body never opens a quick-log dialog). All quick-log mutations
 * happen on the home page.
 * ──────────────────────────────────────────────────────────────────── */

export function AnalyticsPage({ title }: { title?: string }) {
  return (
    <AnalyticsStateProvider>
      <View style={styles.container}>
        {title ? (
          <View style={styles.headerBar}>
            <Text style={styles.headerTitle}>{title}</Text>
          </View>
        ) : null}
        <AnalyticsTabs />
        <AnalyticsDateNavigator />
        <AnalyticsBody />
      </View>
    </AnalyticsStateProvider>
  );
}

function AnalyticsBody() {
  const { width } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  const useColumns = isDesktop && width >= 1280;

  if (useColumns) {
    return (
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.columns}>
          <View style={styles.col}>
            <TrackableProgressionSection />
          </View>
          <View style={styles.col}>
            <TimeBreakdownSection />
          </View>
          <View style={styles.col}>
            <TimeSpendSection />
          </View>
          <View style={styles.col}>
            <ReviewSection />
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <TrackableProgressionSection />
      <TimeBreakdownSection />
      <TimeSpendSection />
      <ReviewSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  scrollContent: { padding: 16, paddingBottom: 40 },
  columns: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  col: { flex: 1, minWidth: 0 },
});
