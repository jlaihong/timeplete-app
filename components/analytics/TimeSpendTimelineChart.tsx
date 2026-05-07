import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Colors } from "../../constants/colors";
import type { TimeWindowLite } from "./useAnalyticsDataset";
import type { TrackableLite } from "./useAnalyticsDataset";
import {
  buildBlocksForDay,
  SECONDS_PER_DAY,
  type TimelineBlock,
} from "./timeSpendTimelineUtils";

/**
 * Vertical wall-clock strip: top = 00:00, bottom = 24:00 — calendar / day-planner
 * parity (not a compact dashboard chart).
 *
 * One label + horizontal guide per hour (00:00 … 24:00).
 */
const HOUR_BOUNDARIES = Array.from({ length: 25 }, (_, i) => i);

const AXIS_W_NARROW = 46;
const AXIS_W_WIDE = 54;
const LABEL_COL_NARROW = 48;
const LABEL_COL_WIDE = 64;

function formatHourBoundary(h: number): string {
  if (h <= 0) return "00:00";
  if (h >= 24) return "24:00";
  return `${String(h).padStart(2, "0")}:00`;
}

function axisTickTranslateY(h: number): number {
  if (h === 0) return 0;
  if (h === 24) return -11;
  return -6;
}

/** Pixels per hour — tall strip so morning/afternoon/evening read at a glance. */
function trackHeightForWidth(windowWidth: number): number {
  const pxPerHour =
    windowWidth < 380 ? 32 : windowWidth < 720 ? 36 : 42;
  return pxPerHour * 24;
}

function sortBlocksForOverlapDraw(blocks: TimelineBlock[]): TimelineBlock[] {
  return [...blocks].sort(
    (a, b) =>
      a.startSec - b.startSec ||
      b.endSec - a.endSec ||
      a.windowId.localeCompare(b.windowId),
  );
}

export interface TimeSpendTimelineChartProps {
  days: string[];
  timeWindows: TimeWindowLite[];
  resolveTrackableId: (w: TimeWindowLite) => string | null;
  trackables: Record<string, TrackableLite | undefined>;
  fallbackColour: string;
  dayLabel: (dayYYYYMMDD: string) => string;
  /** Extra gap between days (weekly / monthly). */
  rowGap?: number;
}

export function TimeSpendTimelineChart({
  days,
  timeWindows,
  resolveTrackableId,
  trackables,
  fallbackColour,
  dayLabel,
  rowGap = 24,
}: TimeSpendTimelineChartProps) {
  const { width } = useWindowDimensions();
  const labelColW = width < 400 ? LABEL_COL_NARROW : LABEL_COL_WIDE;
  const axisW = width < 400 ? AXIS_W_NARROW : AXIS_W_WIDE;
  const trackHeight = trackHeightForWidth(width);
  const compactAxis = width < 400;

  const rows = useMemo(() => {
    return days.map((day) => {
      const blocks = buildBlocksForDay(
        timeWindows,
        day,
        resolveTrackableId,
        trackables,
        fallbackColour,
      );
      return { day, blocks: sortBlocksForOverlapDraw(blocks) };
    });
  }, [days, timeWindows, resolveTrackableId, trackables, fallbackColour]);

  return (
    <View style={styles.wrap}>
      {rows.map(({ day, blocks }, rowIdx) => (
        <View
          key={day}
          style={[
            styles.dayRow,
            rowIdx < rows.length - 1 && {
              marginBottom: rowGap,
              paddingBottom: 6,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: "rgba(186, 201, 205, 0.2)",
            },
          ]}
        >
          <View style={[styles.dayLabelCol, { width: labelColW }]}>
            <Text style={styles.dayLabel} numberOfLines={2}>
              {dayLabel(day)}
            </Text>
          </View>
          <View
            style={[
              styles.timelineBlock,
              Platform.OS === "web"
                ? ({ userSelect: "none" } as object)
                : null,
            ]}
          >
            <View
              style={[styles.axisCol, { width: axisW, height: trackHeight }]}
            >
              {HOUR_BOUNDARIES.map((h) => (
                <Text
                  key={h}
                  style={[
                    styles.axisTick,
                    compactAxis && styles.axisTickCompact,
                    {
                      top: `${(h / 24) * 100}%`,
                      transform: [{ translateY: axisTickTranslateY(h) }],
                    },
                  ]}
                >
                  {formatHourBoundary(h)}
                </Text>
              ))}
            </View>
            <View style={[styles.trackColumn, { height: trackHeight }]}>
              <View style={styles.grid} pointerEvents="none">
                {HOUR_BOUNDARIES.map((h) => (
                  <View
                    key={h}
                    style={[
                      styles.hourLine,
                      {
                        top: `${(h / 24) * 100}%`,
                        opacity: h % 6 === 0 ? 0.14 : 0.09,
                      },
                    ]}
                  />
                ))}
              </View>
              {blocks.map((b, i) => {
                const minHeightPct = Math.max(
                  (5 / trackHeight) * 100,
                  0.09,
                );
                const span = Math.max(b.endSec - b.startSec, 0);
                const topPct = (b.startSec / SECONDS_PER_DAY) * 100;
                const heightPct = Math.max(
                  (span / SECONDS_PER_DAY) * 100,
                  minHeightPct,
                );
                return (
                  <View
                    key={b.windowId}
                    style={[
                      styles.block,
                      {
                        top: `${topPct}%`,
                        height: `${heightPct}%`,
                        backgroundColor: b.colour,
                        zIndex: i + 1,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
  },
  dayRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  dayLabelCol: {
    paddingRight: 12,
    paddingTop: 8,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
    textAlign: "right",
    letterSpacing: 0.1,
    lineHeight: 18,
  },
  timelineBlock: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    minWidth: 0,
  },
  axisCol: {
    position: "relative",
    paddingRight: 8,
    flexShrink: 0,
  },
  axisTick: {
    position: "absolute",
    right: 0,
    fontSize: 11,
    lineHeight: 13,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  axisTickCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  trackColumn: {
    flex: 1,
    minWidth: 0,
    position: "relative",
  },
  grid: {
    ...StyleSheet.absoluteFillObject,
  },
  hourLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    marginTop: -StyleSheet.hairlineWidth,
    backgroundColor: Colors.outlineVariant,
  },
  block: {
    position: "absolute",
    left: "1.5%",
    width: "97%",
    borderRadius: 3,
    opacity: 0.84,
  },
});
