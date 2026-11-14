import { FontSize } from "../../../theme/tokens";
import React from "react";
import { SkeletonRows } from "../../ui/SkeletonRows";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { SectionCard } from "../SectionCard";
import { useAnalyticsState } from "../AnalyticsState";
import { AnalyticsTrackableWidgetFactory } from "../widgets/AnalyticsTrackableWidgetFactory";
import { useAuth } from "../../../hooks/useAuth";
import { todayYYYYMMDD } from "../../../lib/dates";

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

  // `today` is supplied by the client so the lifetime-average denominator
  // inside the query is deterministic (no `new Date()` in handlers — see
  // `convex/trackables.ts`). Computed at render time; falls back to
  // `windowEnd` on the server if absent. Cache key churn is bounded because
  // `useAnalyticsState` already re-renders these sections daily.
  const today = React.useMemo(() => todayYYYYMMDD(), []);

  const series = useQuery(
    api.trackables.getTrackableAnalyticsSeries,
    profileReady
      ? {
          windowStart,
          windowEnd,
          today,
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

  // On the Daily tab most trackables have nothing for the day, and each
  // drew a full card holding only a dash. Those fold under one toggle so
  // the day's actual activity is what you see. Longer periods keep every
  // card: their charts are worth reading even when the period is quiet.
  const foldInactive = selectedTab === "DAILY";
  const [showInactive, setShowInactive] = React.useState(false);
  const all = fresh?.trackables ?? [];
  const activeGoals = foldInactive ? all.filter(hasActivity) : all;
  const inactiveGoals = foldInactive ? all.filter((g) => !hasActivity(g)) : [];
  const renderGoal = (goal: (typeof all)[number]) => (
    <AnalyticsTrackableWidgetFactory
      key={goal._id}
      goal={goal}
      tab={selectedTab}
      windowStart={windowStart}
      windowEnd={windowEnd}
    />
  );

  return (
    <SectionCard title="Trackable Progression">
      {!fresh ? (
        <SkeletonRows
          flush
          count={3}
          rowHeight={84}
          accessibilityLabel="Loading trackable progression"
        />
      ) : fresh.trackables.length === 0 ? (
        <Text style={styles.empty}>
          No active trackables. Add one from the Trackables tab.
        </Text>
      ) : (
        <View>
          {activeGoals.map(renderGoal)}
          {foldInactive && activeGoals.length === 0 ? (
            <Text style={styles.empty}>Nothing logged on this day.</Text>
          ) : null}
          {inactiveGoals.length > 0 ? (
            <>
              <Pressable
                onPress={() => setShowInactive((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showInactive }}
                style={styles.inactiveToggle}
              >
                <Ionicons
                  name={showInactive ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color={Colors.textTertiary}
                />
                <Text style={styles.inactiveToggleText}>
                  No activity ({inactiveGoals.length})
                </Text>
              </Pressable>
              {showInactive ? inactiveGoals.map(renderGoal) : null}
            </>
          ) : null}
        </View>
      )}
    </SectionCard>
  );
}

/** Whether a trackable has anything recorded in the loaded period. */
function hasActivity(goal: { days: ReadonlyArray<Record<string, unknown>> }) {
  return goal.days.some((day) =>
    ["daysCompleted", "secondsAttributed", "trackerCount"].some(
      (key) => typeof day[key] === "number" && (day[key] as number) > 0,
    ),
  );
}

const styles = StyleSheet.create({
  inactiveToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginTop: 4,
  },
  inactiveToggleText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  empty: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
});
