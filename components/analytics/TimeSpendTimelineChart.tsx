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
 */
const TICK_LABELS = ["00:00", "06:00", "12:00", "18:00", "24:00"] as const;
const TICK_POSITION_PCT = [0, 25, 50, 75, 100] as const;

/** Hours 1–23 for faint grid (6h multiples slightly stronger). */
const HOUR_MARKERS = Array.from({ length: 23 }, (_, i) => i + 1);

const AXIS_W_NARROW = 42;
const AXIS_W_WIDE = 50;
const LABEL_COL_NARROW = 48;
const LABEL_COL_WIDE = 64;

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
                          idx === 0
                            ? 0
                            : idx === TICK_LABELS.length - 1
                              ? -12
                              : -7,
                      },
                    ],
                  },
                ]}
              >
                {label}
              </Text>
            ))}
          </View>
          <View
            style={[
              styles.scheduleStrip,
              { height: trackHeight },
              Platform.OS === "web"
                ? ({ userSelect: "none" } as object)
                : null,
            ]}
          >
            <DayTrack blocks={blocks} trackHeight={trackHeight} />
          </View>
        </View>
      ))}
    </View>
  );
}

function DayTrack({
  blocks,
  trackHeight,
}: {
  blocks: TimelineBlock[];
  trackHeight: number;
}) {
  const minHeightPct = Math.max((5 / trackHeight) * 100, 0.09);

  return (
    <View style={[styles.track, { height: trackHeight }]}>
      <View style={styles.grid} pointerEvents="none">
        {HOUR_MARKERS.map((h) => (
          <View
            key={h}
            style={[
              styles.hourLine,
              {
                top: `${(h / 24) * 100}%`,
                opacity: h % 6 === 0 ? 0.1 : 0.045,
              },
            ]}
          />
        ))}
      </View>
      {blocks.map((b, i) => {
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
  axisCol: {
    position: "relative",
    paddingRight: 10,
  },
  axisTick: {
    position: "absolute",
    right: 0,
    fontSize: 11,
    lineHeight: 14,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  scheduleStrip: {
    flex: 1,
    minWidth: 0,
    paddingLeft: 10,
    marginLeft: 2,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: "rgba(186, 201, 205, 0.35)",
  },
  track: {
    position: "relative",
    width: "100%",
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
    left: "2%",
    width: "96%",
    borderRadius: 3,
    opacity: 0.84,
  },
});
