import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { formatSecondsAsHM } from "../../../lib/dates";
import {
  groupTimeWindows,
  GroupByMode,
  defaultGroupingLevelsForTab,
  GroupingLookups,
} from "../../../lib/grouping";
import { SectionCard } from "../SectionCard";
import { useAnalyticsDataset } from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";
import { TimeBreakdownSunburst } from "../widgets/TimeBreakdownSunburst";
import { GroupByLevelBuilder } from "../widgets/GroupByLevelBuilder";

/* ──────────────────────────────────────────────────────────────────── *
 * Time Breakdown — productivity-one `analytics-time-breakdown-widget`.
 * Users build an ordered multi-level Group by sequence (dropdown rows +
 * add/remove); the sunburst drills Category → Tag → Goal → … exactly in
 * that order (`sunburstRingBuckets` / `buildSunburstHierarchy`).
 * ──────────────────────────────────────────────────────────────────── */

export function TimeBreakdownSection() {
  const { selectedTab } = useAnalyticsState();
  const dataset = useAnalyticsDataset();

  const [groupingLevels, setGroupingLevels] = useState<GroupByMode[]>(() =>
    defaultGroupingLevelsForTab(selectedTab)
  );
  const [lastTab, setLastTab] = useState(selectedTab);
  if (lastTab !== selectedTab) {
    setLastTab(selectedTab);
    setGroupingLevels(defaultGroupingLevelsForTab(selectedTab));
  }

  const primaryMode = groupingLevels[0] ?? defaultGroupingLevelsForTab(selectedTab)[0]!;

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

  const items = useMemo(
    () =>
      groupTimeWindows(dataset.timeWindows, primaryMode, groupingLookups),
    [dataset.timeWindows, primaryMode, groupingLookups]
  );

  const resetScheduleKey = `${selectedTab}-${groupingLevels.join("|")}-${dataset.windowStart}-${dataset.windowEnd}`;
  const dataSignature = `${dataset.windowStart}-${dataset.windowEnd}-${dataset.totalSeconds}-${dataset.timeWindows.length}`;

  return (
    <SectionCard title="Time Breakdown">
      <GroupByLevelBuilder
        tab={selectedTab}
        levels={groupingLevels}
        onChange={setGroupingLevels}
      />

      <TimeBreakdownSunburst
        timeWindows={dataset.timeWindows}
        totalSecondsDenominator={dataset.totalSeconds}
        groupingLevels={groupingLevels}
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
