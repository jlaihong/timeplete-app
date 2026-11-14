import { FontSize, Radius } from "../../theme/tokens";
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Colors } from "../../constants/colors";
import { InsightsSwitch } from "../layout/InsightsSwitch";
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
        <InsightsSwitch active="analytics" />
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

type PhoneSection = "breakdown" | "timeline" | "progress";
const PHONE_SECTIONS: { key: PhoneSection; label: string }[] = [
  { key: "breakdown", label: "Breakdown" },
  { key: "timeline", label: "Timeline" },
  { key: "progress", label: "Trackables" },
];

function AnalyticsBody() {
  const { width } = useWindowDimensions();
  const isDesktop = useIsDesktop();
  const useColumns = isDesktop && width >= 1280;
  const [phoneSection, setPhoneSection] = useState<PhoneSection>("breakdown");

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

  // Phones show one section at a time. Stacked, the three made a page
  // several screens long, with three charts loading at once.
  if (!isDesktop) {
    return (
      <>
        <View style={styles.sectionTabs} accessibilityRole="tablist">
          {PHONE_SECTIONS.map((item) => {
            const selected = item.key === phoneSection;
            return (
              <Pressable
                key={item.key}
                onPress={() => setPhoneSection(item.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={[styles.sectionTab, selected && styles.sectionTabActive]}
              >
                <Text
                  style={[
                    styles.sectionTabText,
                    selected && styles.sectionTabTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {phoneSection === "progress" ? <TrackableProgressionSection /> : null}
          {phoneSection === "breakdown" ? <TimeBreakdownSection /> : null}
          {phoneSection === "timeline" ? <TimeSpendSection /> : null}
        </ScrollView>
      </>
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
  sectionTabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sectionTab: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTabActive: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primary,
  },
  sectionTabText: { fontSize: FontSize.body, color: Colors.textSecondary },
  sectionTabTextActive: {
    color: Colors.onPrimaryContainer,
    fontWeight: "600",
  },
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
