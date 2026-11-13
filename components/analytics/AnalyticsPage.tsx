import { FontSize } from "../../theme/tokens";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Colors } from "../../constants/colors";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { AnalyticsStateProvider } from "./AnalyticsState";
import { AnalyticsTabs } from "./AnalyticsTabs";
import { AnalyticsDateNavigator } from "./AnalyticsDateNavigator";
import { TrackableProgressionSection } from "./sections/TrackableProgressionSection";
import { TimeBreakdownSection } from "./sections/TimeBreakdownSection";
import { TimeSpendSection } from "./sections/TimeSpendSection";

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsPage — productivity-one's `analytics-page` shell.
 *
 *  - Single state provider at the root (selectedTab + selectedDate)
 *  - Tab bar
 *  - Date navigator (hides picker on Yearly)
 *  - Sections that ALL consume the same dataset via
 *    `useAnalyticsDataset()`. Switching tab or date triggers a single
 *    Convex re-query and re-renders every section together.
 *
 * Layout: row of three columns from `md+` (≥1280px), single-column
 * stack on narrow viewports. Reviews are not shown here — they have
 * their own page in the sidebar on every platform.
 *
 * Note: there is no `TrackableDialogHost` mounted here — analytics
 * widgets are intentionally read-only (header `open_in_new` only;
 * the body never opens a quick-log dialog). All quick-log mutations
 * happen on the home page.
 *
 * The four Convex-heavy sections mount one frame after the shell so the
 * tab transition can commit and paint (header + tab bar + date nav)
 * before ~4× `useQuery` trees initialize — mirrors “route first, data
 * second” SPAs and avoids blocking the main thread on navigation.
 * ──────────────────────────────────────────────────────────────────── */

function AnalyticsHeavyBodyGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);
  if (!ready) {
    return (
      <View style={styles.bodyPending} accessibilityLabel="Loading analytics">
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }
  return children;
}

/**
 * Title, period tabs and date navigation. One row on desktop (they used to
 * be three stacked rows, ~150px before any chart); stacked on phones,
 * where the native header already shows the title.
 */
function AnalyticsToolbar({ title }: { title?: string }) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) {
    return (
      <>
        <AnalyticsTabs />
        <AnalyticsDateNavigator />
      </>
    );
  }
  return (
    <View style={styles.toolbar}>
      {title ? (
        <Text style={styles.toolbarTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <AnalyticsTabs inline />
      <AnalyticsDateNavigator inline />
    </View>
  );
}

export function AnalyticsPage({ title }: { title?: string }) {
  return (
    <AnalyticsStateProvider>
      <View style={styles.container}>
        <AnalyticsToolbar title={title} />
        <AnalyticsHeavyBodyGate>
          <AnalyticsBody />
        </AnalyticsHeavyBodyGate>
      </View>
    </AnalyticsStateProvider>
  );
}

function AnalyticsBody() {
  const { width } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  const useColumns = isDesktop && width >= 1280;

  if (useColumns) {
    // Each column scrolls on its own. As one long page, the tallest column
    // (trackables) left the other two blank once you scrolled past them.
    return (
      <View style={styles.columns}>
        <ScrollView style={styles.col} contentContainerStyle={styles.colContent}>
          <TrackableProgressionSection />
        </ScrollView>
        <ScrollView style={styles.col} contentContainerStyle={styles.colContent}>
          <TimeBreakdownSection />
        </ScrollView>
        <ScrollView style={styles.col} contentContainerStyle={styles.colContent}>
          <TimeSpendSection />
        </ScrollView>
      </View>
    );
  }

  // Reviews are written on their own page (in the sidebar on every
  // platform), so Analytics doesn't repeat the questions.
  return (
    <ScrollView contentContainerStyle={styles.scrollContent}>
      <TrackableProgressionSection />
      <TimeBreakdownSection />
      <TimeSpendSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  bodyPending: {
    flex: 1,
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  columns: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 16,
  },
  col: { flex: 1, minWidth: 0 },
  colContent: { paddingTop: 8, paddingBottom: 40 },
  // Desktop: title, period tabs and date navigation share one row.
  toolbar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
  },
  toolbarTitle: {
    fontSize: FontSize.title,
    fontWeight: "600",
    color: Colors.text,
  },
  toolbarSpacer: { flex: 1 },
});
