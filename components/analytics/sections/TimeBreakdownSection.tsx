import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import { formatSecondsAsHM } from "../../../lib/dates";
import { DEFAULT_EVENT_COLOR } from "../../../lib/eventColors";
import {
  GroupByMode,
  defaultGroupingLevelsForTab,
  GroupingLookups,
} from "../../../lib/grouping";
import {
  buildSunburstHierarchy,
  type SunburstHierarchyNode,
} from "../../../lib/analytics/sunburstHierarchy";
import { SectionCard } from "../SectionCard";
import { useAnalyticsDataset } from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";
import { TimeBreakdownSunburst } from "../widgets/TimeBreakdownSunburst";
import { TimeBreakdownGroupBy } from "../widgets/TimeBreakdownGroupBy";

const PATH_SEP = "\u001f";

function nodePath(parentPath: string, key: string): string {
  return parentPath === "" ? key : `${parentPath}${PATH_SEP}${key}`;
}

/* ──────────────────────────────────────────────────────────────────── *
 * Time Breakdown — productivity-one `analytics-time-breakdown-widget`.
 * Non-dropdown grouping chips + Add select; multi-ring sunburst uses `levels`.
 * Breakdown list mirrors the same hierarchy as the chart (expandable rows).
 * ──────────────────────────────────────────────────────────────────── */

function BreakdownTreeRows({
  nodes,
  depth,
  parentPath,
  totalDenominator,
  expandedPaths,
  onToggle,
}: {
  nodes: SunburstHierarchyNode[];
  depth: number;
  parentPath: string;
  totalDenominator: number;
  expandedPaths: Set<string>;
  onToggle: (path: string) => void;
}) {
  const indent = depth * 14;

  return (
    <>
      {nodes.map((node) => {
        const path = nodePath(parentPath, node.key);
        const hasChildren = node.children.length > 0;
        const isExpanded = expandedPaths.has(path);
        const pct =
          totalDenominator > 0
            ? Math.round((node.totalSeconds / totalDenominator) * 100)
            : 0;
        const fill = node.colour ?? DEFAULT_EVENT_COLOR;

        return (
          <View key={path}>
            <Pressable
              onPress={() => hasChildren && onToggle(path)}
              disabled={!hasChildren}
              style={({ pressed }) => [
                styles.row,
                { paddingLeft: 8 + indent },
                pressed && hasChildren ? styles.rowPressed : null,
                Platform.OS === "web" && hasChildren
                  ? ({ cursor: "pointer" } as const)
                  : null,
              ]}
              accessibilityRole={hasChildren ? "button" : "none"}
              accessibilityState={{ expanded: hasChildren ? isExpanded : undefined }}
            >
              <View style={styles.rowChevron}>
                {hasChildren ? (
                  <Ionicons
                    name={isExpanded ? "chevron-down" : "chevron-forward"}
                    size={18}
                    color={Colors.textSecondary}
                  />
                ) : (
                  <View style={styles.chevronSpacer} />
                )}
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowLabelRow}>
                  <View style={[styles.dot, { backgroundColor: fill }]} />
                  <Text style={[styles.rowLabel, depth > 0 && styles.rowLabelNested]} numberOfLines={2}>
                    {node.label}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${pct}%`,
                        backgroundColor: fill,
                      },
                    ]}
                  />
                </View>
                <View style={styles.rowValues}>
                  <Text style={styles.rowValueTime}>
                    {formatSecondsAsHM(node.totalSeconds)}
                  </Text>
                  <Text style={styles.rowValuePct}>{pct}%</Text>
                </View>
              </View>
            </Pressable>
            {hasChildren && isExpanded ? (
              <BreakdownTreeRows
                nodes={node.children}
                depth={depth + 1}
                parentPath={path}
                totalDenominator={totalDenominator}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
              />
            ) : null}
          </View>
        );
      })}
    </>
  );
}

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

  const [expandedPaths, setExpandedPaths] = useState(() => new Set<string>());

  const groupingLookups = useMemo(
    () =>
      ({
        tasks: dataset.tasks,
        tags: dataset.tags,
        lists: dataset.lists,
        trackables: dataset.trackables as GroupingLookups["trackables"],
        listIdToTrackableId: dataset.listIdToTrackableId,
        resolveTrackableId: dataset.resolveTrackableId,
        analyticsTab: selectedTab,
      }) as GroupingLookups,
    [
      dataset.tasks,
      dataset.tags,
      dataset.lists,
      dataset.trackables,
      dataset.listIdToTrackableId,
      dataset.resolveTrackableId,
      selectedTab,
    ]
  );

  const resetScheduleKey = `${selectedTab}-${groupingLevels.join("|")}-${dataset.windowStart}-${dataset.windowEnd}`;
  const dataSignature = `${dataset.windowStart}-${dataset.windowEnd}-${dataset.totalSeconds}-${dataset.timeWindows.length}`;

  useEffect(() => {
    setExpandedPaths(new Set());
  }, [resetScheduleKey, dataSignature]);

  const hierarchy = useMemo(
    () =>
      groupingLevels.length === 0
        ? null
        : buildSunburstHierarchy(
            dataset.timeWindows,
            groupingLevels,
            groupingLookups
          ),
    [dataset.timeWindows, groupingLevels, groupingLookups]
  );

  const togglePath = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  return (
    <SectionCard title="Time Breakdown">
      <TimeBreakdownGroupBy
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

      {!dataset.isLoading &&
      hierarchy !== null &&
      hierarchy.children.length > 0 ? (
        <View style={styles.list}>
          <BreakdownTreeRows
            nodes={hierarchy.children}
            depth={0}
            parentPath=""
            totalDenominator={dataset.totalSeconds}
            expandedPaths={expandedPaths}
            onToggle={togglePath}
          />
        </View>
      ) : null}
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  list: {
    marginTop: 4,
    alignSelf: "stretch",
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    paddingRight: 4,
  },
  rowPressed: {
    opacity: 0.85,
  },
  rowChevron: {
    width: 24,
    alignItems: "center",
    paddingTop: 2,
  },
  chevronSpacer: {
    width: 18,
    height: 18,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
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
    fontWeight: "600",
    color: Colors.text,
  },
  rowLabelNested: {
    fontWeight: "500",
    fontSize: 12.5,
    color: Colors.textSecondary,
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
