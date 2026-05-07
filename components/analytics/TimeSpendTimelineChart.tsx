import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Colors } from "../../constants/colors";
import { level1Shadow } from "../../theme/panels";
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
const TICK_POSITION_PCT = [0, 25, 50, 75, 100] as const;

const AXIS_W_NARROW = 38;
const AXIS_W_WIDE = 46;
const LABEL_COL_NARROW = 44;
const LABEL_COL_WIDE = 58;

const TRACK_PADDING = 5;
const WELL_RADIUS = 10;
const BLOCK_RADIUS = 5;

function trackHeightForWidth(windowWidth: number): number {
  if (windowWidth < 360) return 220;
  if (windowWidth < 480) return 272;
  return 320;
}

const blockChrome = Platform.select({
  web: {
    boxShadow:
      "0 1px 2px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14)",
  } as object,
  default: {
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.35,
    shadowRadius: 1.5,
  },
});

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
  rowGap = 12,
}: TimeSpendTimelineChartProps) {
  const { width } = useWindowDimensions();
  const labelColW = width < 400 ? LABEL_COL_NARROW : LABEL_COL_WIDE;
  const axisW = width < 400 ? AXIS_W_NARROW : AXIS_W_WIDE;
  const trackHeight = trackHeightForWidth(width);
  const innerHeight = Math.max(0, trackHeight - TRACK_PADDING * 2);

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
          style={[
            styles.dayRow,
            rowIdx < rows.length - 1 && { marginBottom: rowGap },
            rowIdx < rows.length - 1 && styles.dayRowDivider,
          ]}
        >
          <View style={[styles.dayLabelCol, { width: labelColW }]}>
            <Text style={styles.dayLabel} numberOfLines={2}>
              {dayLabel(day)}
            </Text>
          </View>
          <View style={[styles.axisCol, { width: axisW, height: trackHeight }]}>
            {TICK_LABELS.map((label, idx) => (
              <Text
                key={label}
                style={[
                  styles.axisTick,
                  {
                    top: `${TICK_POSITION_PCT[idx]}%`,
                    transform: [
                      {
                        translateY:
                          idx === 0 ? 0 : idx === TICK_LABELS.length - 1 ? -11 : -6,
                      },
                    ],
                  },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>
          <View style={[styles.trackChrome, { height: trackHeight }]}>
            <View style={[styles.trackWell, { height: innerHeight }]}>
              <DayTrack
                blocks={blocks}
                lanes={lanes}
                laneCount={laneCount}
                trackHeight={innerHeight}
              />
            </View>
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
  const laneGapPct = laneCount > 1 ? 0.5 : 0;
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
        const heightPct = Math.max((span / SECONDS_PER_DAY) * 100, 0.22);
        const leftPct = lane * (slotPct + laneGapPct);
        const widthPct = slotPct;

        return (
          <View
            key={b.windowId}
            style={[
              styles.block,
              blockChrome,
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
    marginBottom: 6,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingBottom: 4,
  },
  dayRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  dayLabelCol: {
    paddingRight: 10,
    paddingTop: 6,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
    textAlign: "right",
    letterSpacing: 0.15,
  },
  axisCol: {
    position: "relative",
    paddingRight: 8,
  },
  axisTick: {
    position: "absolute",
    right: 0,
    fontSize: 11,
    lineHeight: 13,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
    letterSpacing: 0.2,
  },
  trackChrome: {
    flex: 1,
    minWidth: 0,
    padding: TRACK_PADDING,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    ...level1Shadow,
    ...(Platform.OS === "web"
      ? ({ userSelect: "none" } as object)
      : null),
  },
  trackWell: {
    width: "100%",
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: WELL_RADIUS,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.22)",
  },
  track: {
    position: "relative",
    width: "100%",
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
    backgroundColor: Colors.outline,
    opacity: 0.2,
  },
  block: {
    position: "absolute",
    borderRadius: BLOCK_RADIUS,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
});
