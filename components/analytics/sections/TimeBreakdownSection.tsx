import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Colors } from "../../../constants/colors";
import { formatSecondsAsHM } from "../../../lib/dates";
import { groupTimeWindows, GroupByMode } from "../../../lib/grouping";
import { SectionCard } from "../SectionCard";
import { useAnalyticsDataset } from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";

/* ──────────────────────────────────────────────────────────────────── *
 * Time Breakdown — productivity-one's `analytics-time-breakdown-widget`.
 * P1 uses a sunburst + accordion driven by a `<group-by-widget>` chip
 * row. We render the same controls (chips per dimension) and a
 * percentage bar list. Default dimension differs per tab to match P1.
 *
 * Sub-filter (group-by) is **local to the section** and only changes
 * the *visualisation* — date filtering still flows from the global
 * AnalyticsState. This matches P1 exactly: changing groups never
 * overrides the analytics window.
 * ──────────────────────────────────────────────────────────────────── */

const ALL_MODES: { id: GroupByMode; label: string }[] = [
  { id: "trackable", label: "Trackable" },
  { id: "list", label: "List" },
  { id: "task", label: "Task" },
  { id: "tag", label: "Tag" },
  { id: "date", label: "Date" },
  { id: "day_of_week", label: "Day of Week" },
  { id: "month", label: "Month" },
];

function defaultModeForTab(tab: string): GroupByMode {
  switch (tab) {
    case "DAILY":
      return "trackable";
    case "WEEKLY":
      return "trackable";
    case "MONTHLY":
      return "trackable";
    case "YEARLY":
      return "month";
    default:
      return "trackable";
  }
}

function modesForTab(tab: string): GroupByMode[] {
  switch (tab) {
    case "DAILY":
      return ["trackable", "list", "task", "tag"];
    case "WEEKLY":
      return ["trackable", "list", "task", "date", "tag"];
    case "MONTHLY":
      return ["trackable", "list", "task", "date", "tag", "day_of_week"];
    case "YEARLY":
      return ["trackable", "list", "task", "month", "tag", "day_of_week"];
    default:
      return ["trackable", "list", "task", "tag"];
  }
}

export function TimeBreakdownSection() {
  const { selectedTab } = useAnalyticsState();
  const dataset = useAnalyticsDataset();

  // Reset the local group dimension when the user switches tab so we
  // always land on P1's "default for this tab" first.
  const [overrideMode, setOverrideMode] = useState<GroupByMode | null>(null);
  const [lastTab, setLastTab] = useState<string>(selectedTab);
  if (lastTab !== selectedTab) {
    setLastTab(selectedTab);
    setOverrideMode(null);
  }

  const mode: GroupByMode = overrideMode ?? defaultModeForTab(selectedTab);
  const availableModes = modesForTab(selectedTab);

  const items = useMemo(
    () =>
      groupTimeWindows(dataset.timeWindows, mode, {
        tasks: dataset.tasks as Record<string, { name: string; listId?: string }>,
        tags: dataset.tags as Record<string, { name: string; colour: string }>,
        lists: dataset.lists as Record<string, { name: string; colour: string }>,
        trackables: dataset.trackables as Record<
          string,
          { name: string; colour: string }
        >,
      }),
    [dataset, mode]
  );

  return (
    <SectionCard title="Time Breakdown">
      <View style={styles.modeRow}>
        {availableModes.map((m) => {
          const meta = ALL_MODES.find((x) => x.id === m);
          if (!meta) return null;
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
                {meta.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {dataset.isLoading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>No time recorded in this period.</Text>
      ) : (
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
      )}
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
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
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
