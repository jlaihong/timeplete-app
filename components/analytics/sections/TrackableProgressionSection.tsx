import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { todayYYYYMMDD } from "../../../lib/dates";
import { SectionCard } from "../SectionCard";
import { useAnalyticsState } from "../AnalyticsState";
import { AnalyticsTrackableWidgetFactory } from "../widgets/AnalyticsTrackableWidgetFactory";

/* ──────────────────────────────────────────────────────────────────── *
 * Trackable Progression — analytics-page section.
 *
 * Architecture (per the user's "shared data, separate UI" rule):
 *
 *   Home page                 Analytics page
 *   ─────────                 ──────────────
 *   TrackableList             TrackableProgressionSection
 *        │                            │
 *        ▼                            ▼
 *   getGoalDetails           getTrackableAnalyticsSeries
 *   (today, weekStart)         (windowStart, windowEnd)
 *        │                            │
 *        ▼                            ▼
 *   TrackableWidgetFactory   AnalyticsTrackableWidgetFactory
 *   (interactive: timer,     (read-only: charts, period
 *    quick-log dialogs,       averages, day pills, no
 *    progress bar, menu)      timer / dialog / menu)
 *
 * Both backend queries share the SAME aggregation helpers
 * (`timeWindowAttributedToTrackable`, `buildTaskInfoMap`,
 * `buildListIdToTrackableId`) — the data layer is genuinely shared.
 * Only the presentation diverges.
 * ──────────────────────────────────────────────────────────────────── */

export function TrackableProgressionSection() {
  const { selectedTab, windowStart, windowEnd } = useAnalyticsState();

  const series = useQuery(api.trackables.getTrackableAnalyticsSeries, {
    windowStart,
    windowEnd,
  });

  const subtitle = subtitleForTab(selectedTab, windowStart, windowEnd);

  // Stale-data guard: if the cached payload is from a previous window,
  // hide it until the new one arrives. Prevents a brief flash of last
  // tab's data while the user switches.
  const fresh =
    series && series.windowStart === windowStart && series.windowEnd === windowEnd
      ? series
      : null;

  return (
    <SectionCard title="Trackable Progression">
      <Text style={styles.subtitle}>{subtitle}</Text>

      {!fresh ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : fresh.trackables.length === 0 ? (
        <Text style={styles.empty}>
          No active trackables. Add one from the Trackables tab.
        </Text>
      ) : (
        <View>
          {fresh.trackables.map((goal) => (
            <AnalyticsTrackableWidgetFactory
              key={goal._id}
              goal={goal}
              tab={selectedTab}
              windowStart={windowStart}
              windowEnd={windowEnd}
            />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

function subtitleForTab(
  tab: string,
  windowStart: string,
  windowEnd: string
): string {
  const today = todayYYYYMMDD();
  const isCurrent = windowEnd >= today;
  const fmt = (yyyymmdd: string) =>
    `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  switch (tab) {
    case "DAILY":
      return isCurrent && windowStart === today
        ? "Today"
        : fmt(windowStart);
    case "WEEKLY":
      return `${fmt(windowStart)} → ${fmt(windowEnd)}`;
    case "MONTHLY":
      return `${windowStart.slice(0, 4)}-${windowStart.slice(4, 6)}`;
    case "YEARLY":
      return windowStart.slice(0, 4);
    default:
      return "";
  }
}

const styles = StyleSheet.create({
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
});
