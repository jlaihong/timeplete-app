import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../../../constants/colors";
import { formatSecondsAsHM } from "../../../lib/dates";
import {
  groupTimeWindows,
  GroupByMode,
  modesForTab,
  defaultModeForTab,
  buildSunburstModeChain,
  GroupingLookups,
} from "../../../lib/grouping";
import { SectionCard } from "../SectionCard";
import { useAnalyticsDataset } from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";
import { TimeBreakdownSunburst } from "../widgets/TimeBreakdownSunburst";

/* ──────────────────────────────────────────────────────────────────── *
 * Time Breakdown — productivity-one's `analytics-time-breakdown-widget`.
 * Chip row chooses the primary grouping; the sunburst rings drill through
 * the tab's remaining dimensions in order (see `buildSunburstModeChain`).
 * ──────────────────────────────────────────────────────────────────── */

const MODE_LABELS: Record<GroupByMode, string> = {
  trackable: "Trackable",
  trackable_type: "Trackable Type",
  list: "List",
  task: "Task",
  tag: "Tag",
  date: "Date",
  day_of_week: "Day of Week",
  month: "Month",
  year: "Year",
};

export function TimeBreakdownSection() {
  const { selectedTab } = useAnalyticsState();
  const dataset = useAnalyticsDataset();

  const [overrideMode, setOverrideMode] = useState<GroupByMode | null>(null);
  const [lastTab, setLastTab] = useState<string>(selectedTab);
  if (lastTab !== selectedTab) {
    setLastTab(selectedTab);
    setOverrideMode(null);
  }

  const mode: GroupByMode = overrideMode ?? defaultModeForTab(selectedTab);
  const availableModes = modesForTab(selectedTab);

  const groupingLookups: GroupingLookups = useMemo(
    () => ({
      tasks: dataset.tasks,
      tags: dataset.tags,
      lists: dataset.lists,
      trackables: dataset.trackables as GroupingLookups["trackables"],
      listIdToTrackableId: dataset.listIdToTrackableId,
      resolveTrackableId: dataset.resolveTrackableId,
    }),
    [
      dataset.tasks,
      dataset.tags,
      dataset.lists,
      dataset.trackables,
      dataset.listIdToTrackableId,
      dataset.resolveTrackableId,
    ]
  );

  const modeChain = useMemo(
    () => buildSunburstModeChain(selectedTab, mode),
    [selectedTab, mode]
  );

  const items = useMemo(
    () =>
      groupTimeWindows(dataset.timeWindows, mode, groupingLookups),
    [dataset.timeWindows, mode, groupingLookups]
  );

  const resetScheduleKey = `${selectedTab}-${mode}-${dataset.windowStart}-${dataset.windowEnd}`;
  const dataSignature = `${dataset.windowStart}-${dataset.windowEnd}-${dataset.totalSeconds}-${dataset.timeWindows.length}`;

  return (
    <SectionCard title="Time Breakdown">
      <View style={styles.modeRow}>
        {availableModes.map((m) => {
          const active = mode === m;
          return (
            <TouchableOpacity
              key={m}
              style={[styles.modeChip, active && styles.modeChipActive]}
              onPress={() => setOverrideMode(m)}
            >
              <Text
                style={[
                  styles.modeChipLabel,
                  active && styles.modeChipLabelActive,
                ]}
              >
                {MODE_LABELS[m]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TimeBreakdownSunburst
        timeWindows={dataset.timeWindows}
        totalSecondsDenominator={dataset.totalSeconds}
        modeChain={modeChain}
        lookups={groupingLookups}
        isLoading={dataset.isLoading}
        resetScheduleKey={resetScheduleKey}
        dataSignature={dataSignature}
      />

      {!dataset.isLoading && items.length > 0 ? (
        <View>
          {items.map((item) => {
            const pct =
              dataset.totalSeconds > 0
                ? Math.round((item.totalSeconds / dataset.totalSeconds) * 100)
                : 0;
            return (
              <View key={item.key} style={styles.row}>
                <View style={styles.rowLabelRow}>
                  {item.colour ? (
                    <View
                      style={[styles.dot, { backgroundColor: item.colour }]}
                    />
                  ) : (
                    <View
                      style={[styles.dot, { backgroundColor: Colors.primary }]}
                    />
                  )}
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {item.label}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${pct}%`,
                        backgroundColor: item.colour ?? Colors.primary,
                      },
                    ]}
                  />
                </View>
                <View style={styles.rowValues}>
                  <Text style={styles.rowValueTime}>
                    {formatSecondsAsHM(item.totalSeconds)}
                  </Text>
                  <Text style={styles.rowValuePct}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  modeChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: Colors.surfaceVariant,
  },
  modeChipActive: { backgroundColor: Colors.primary },
  modeChipLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  modeChipLabelActive: { color: Colors.onPrimary },
  row: {
    paddingVertical: 6,
  },
  rowLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
    color: Colors.text,
  },
  barTrack: {
    height: 6,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 4,
  },
  barFill: { height: 6, borderRadius: 3 },
  rowValues: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  rowValueTime: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
  },
  rowValuePct: {
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
