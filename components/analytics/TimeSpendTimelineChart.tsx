import React, { useMemo } from "react";
import { View, Text, StyleSheet, useWindowDimensions } from "react-native";
import { Colors } from "../../constants/colors";
import type { TimeWindowLite } from "./useAnalyticsDataset";
import type { TrackableLite } from "./useAnalyticsDataset";
import {
  assignOverlapLanes,
  buildBlocksForDay,
  SECONDS_PER_DAY,
  type TimelineBlock,
} from "./timeSpendTimelineUtils";

const TICK_LABELS = ["00:00", "06:00", "12:00", "18:00", "24:00"] as const;

const LANE_HEIGHT = 13;
const LANE_GAP = 3;
const TRACK_PADDING_V = 6;
const TRACK_MIN_HEIGHT = 26;
const LABEL_COL_NARROW = 40;
const LABEL_COL_WIDE = 56;

function timelineRowHeight(maxLane: number): number {
  const n = Math.max(1, maxLane + 1);
  return (
    TRACK_PADDING_V * 2 +
    Math.max(TRACK_MIN_HEIGHT, n * LANE_HEIGHT + Math.max(0, n - 1) * LANE_GAP)
  );
}

export interface TimeSpendTimelineChartProps {
  days: string[];
  timeWindows: TimeWindowLite[];
  resolveTrackableId: (w: TimeWindowLite) => string | null;
  trackables: Record<string, TrackableLite | undefined>;
  fallbackColour: string;
  dayLabel: (dayYYYYMMDD: string) => string;
  /** Extra gap between stacked day rows (weekly/monthly). */
  rowGap?: number;
}

export function TimeSpendTimelineChart({
  days,
  timeWindows,
  resolveTrackableId,
  trackables,
  fallbackColour,
  dayLabel,
  rowGap = 10,
}: TimeSpendTimelineChartProps) {
  const { width } = useWindowDimensions();
  const labelColW = width < 400 ? LABEL_COL_NARROW : LABEL_COL_WIDE;

  const rows = useMemo(() => {
    return days.map((day) => {
      const blocks = buildBlocksForDay(
        timeWindows,
        day,
        resolveTrackableId,
        trackables,
        fallbackColour,
      );
      const lanes =
        blocks.length > 0 ? assignOverlapLanes(blocks) : ([] as number[]);
      const maxLane = lanes.length ? Math.max(...lanes) : 0;
      return { day, blocks, lanes, maxLane, height: timelineRowHeight(maxLane) };
    });
  }, [days, timeWindows, resolveTrackableId, trackables, fallbackColour]);

  return (
    <View style={styles.wrap}>
      <View style={[styles.axisRow, { paddingLeft: labelColW }]}>
        <View style={styles.axisTrack}>
          {TICK_LABELS.map((label) => (
            <Text key={label} style={styles.axisTick}>
              {label}
            </Text>
          ))}
        </View>
      </View>

      {rows.map(({ day, blocks, lanes, height }, rowIdx) => (
        <View
          key={day}
          style={[styles.dayRow, rowIdx < rows.length - 1 && { marginBottom: rowGap }]}
        >
          <View style={[styles.dayLabelCol, { width: labelColW }]}>
            <Text style={styles.dayLabel} numberOfLines={2}>
              {dayLabel(day)}
            </Text>
          </View>
          <View style={styles.trackArea}>
            <DayTrack
              blocks={blocks}
              lanes={lanes}
              trackHeight={height}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function DayTrack({
  blocks,
  lanes,
  trackHeight,
}: {
  blocks: TimelineBlock[];
  lanes: number[];
  trackHeight: number;
}) {
  return (
    <View style={[styles.track, { minHeight: trackHeight }]}>
      <View style={styles.grid} pointerEvents="none">
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.gridLine, { left: `${(i / 4) * 100}%` }]}
          />
        ))}
      </View>
      {blocks.map((b, i) => {
        const lane = lanes[i] ?? 0;
        const span = Math.max(b.endSec - b.startSec, 0);
        const widthPct = Math.max((span / SECONDS_PER_DAY) * 100, 0.12);
        const leftPct = (b.startSec / SECONDS_PER_DAY) * 100;
        const top =
          TRACK_PADDING_V + lane * (LANE_HEIGHT + LANE_GAP);

        return (
          <View
            key={b.windowId}
            style={[
              styles.block,
              {
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                top,
                height: LANE_HEIGHT,
                backgroundColor: b.colour,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 4,
  },
  axisRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginBottom: 6,
  },
  axisTrack: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  axisTick: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  dayLabelCol: {
    paddingRight: 8,
    justifyContent: "center",
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
    textAlign: "right",
  },
  trackArea: {
    flex: 1,
    minWidth: 0,
  },
  track: {
    position: "relative",
    width: "100%",
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 4,
    overflow: "hidden",
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    marginLeft: -0.5,
    backgroundColor: Colors.borderLight,
    opacity: 0.45,
  },
  block: {
    position: "absolute",
    borderRadius: 3,
    opacity: 0.92,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0,0,0,0.35)",
  },
});
