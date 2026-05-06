import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { SectionCard } from "../SectionCard";
import { useAnalyticsState } from "../AnalyticsState";
import { AnalyticsTrackableWidgetFactory } from "../widgets/AnalyticsTrackableWidgetFactory";
import { useAuth } from "../../../hooks/useAuth";

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
 *
 * The visible date range is intentionally NOT rendered here — the
 * analytics page already shows it in the date selector at the top,
 * so repeating it inside this section would be visual noise.
 * ──────────────────────────────────────────────────────────────────── */

export function TrackableProgressionSection() {
  const { selectedTab, windowStart, windowEnd } = useAnalyticsState();
  const { profileReady } = useAuth();

  const series = useQuery(
    api.trackables.getTrackableAnalyticsSeries,
    profileReady
      ? {
          windowStart,
          windowEnd,
        }
      : "skip",
  );

  // Stale-data guard: if the cached payload is from a previous window,
  // hide it until the new one arrives. Prevents a brief flash of last
  // tab's data while the user switches.
  const fresh =
    series && series.windowStart === windowStart && series.windowEnd === windowEnd
      ? series
      : null;

  return (
    <SectionCard title="Trackable Progression">
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

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
});
