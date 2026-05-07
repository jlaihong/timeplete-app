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

/**
 * Wall-clock axis: top = 00:00, bottom = 24:00 (Productivity-One style).
 */
const TICK_LABELS = ["00:00", "06:00", "12:00", "18:00", "24:00"] as const;

const AXIS_W_NARROW = 34;
const AXIS_W_WIDE = 42;
const LABEL_COL_NARROW = 40;
const LABEL_COL_WIDE = 56;

/** Minimum chart height; scales slightly with viewport so the day strip is readable. */
function trackHeightForWidth(windowWidth: number): number {
  if (windowWidth < 360) return 208;
  if (windowWidth < 480) return 256;
  return 304;
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
  const axisW = width < 400 ? AXIS_W_NARROW : AXIS_W_WIDE;
  const trackHeight = trackHeightForWidth(width);

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
      const laneCount = Math.max(1, maxLane + 1);
      return { day, blocks, lanes, laneCount };
    });
  }, [days, timeWindows, resolveTrackableId, trackables, fallbackColour]);

  return (
    <View style={styles.wrap}>
      {rows.map(({ day, blocks, lanes, laneCount }, rowIdx) => (
        <View
          key={day}
          style={[styles.dayRow, rowIdx < rows.length - 1 && { marginBottom: rowGap }]}
        >
          <View style={[styles.dayLabelCol, { width: labelColW }]}>
            <Text style={styles.dayLabel} numberOfLines={2}>
              {dayLabel(day)}
            </Text>
          </View>
          <View style={[styles.axisCol, { width: axisW, height: trackHeight }]}>
            {TICK_LABELS.map((label) => (
              <Text key={label} style={styles.axisTick}>
                {label}
              </Text>
            ))}
          </View>
          <View style={[styles.trackArea, { height: trackHeight }]}>
            <DayTrack
              blocks={blocks}
              lanes={lanes}
              laneCount={laneCount}
              trackHeight={trackHeight}
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
  laneCount,
  trackHeight,
}: {
  blocks: TimelineBlock[];
  lanes: number[];
  laneCount: number;
  trackHeight: number;
}) {
  const laneGapPct = laneCount > 1 ? 0.35 : 0;
  const slotPct = (100 - laneGapPct * (laneCount - 1)) / laneCount;

  return (
    <View style={[styles.track, { height: trackHeight }]}>
      <View style={styles.grid} pointerEvents="none">
        {[1, 2, 3].map((i) => (
          <View
            key={i}
            style={[styles.gridLineH, { top: `${(i / 4) * 100}%` }]}
          />
        ))}
      </View>
      {blocks.map((b, i) => {
        const lane = lanes[i] ?? 0;
        const span = Math.max(b.endSec - b.startSec, 0);
        const topPct = (b.startSec / SECONDS_PER_DAY) * 100;
        const heightPct = Math.max((span / SECONDS_PER_DAY) * 100, 0.18);
        const leftPct = lane * (slotPct + laneGapPct);
        const widthPct = slotPct;

        return (
          <View
            key={b.windowId}
            style={[
              styles.block,
              {
                top: `${topPct}%`,
                height: `${heightPct}%`,
                left: `${leftPct}%`,
                width: `${widthPct}%`,
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
  dayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dayLabelCol: {
    paddingRight: 8,
    paddingTop: 4,
  },
  dayLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
    textAlign: "right",
  },
  axisCol: {
    justifyContent: "space-between",
    paddingRight: 6,
    paddingVertical: 2,
  },
  axisTick: {
    fontSize: 10,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
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
  gridLineH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth,
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
