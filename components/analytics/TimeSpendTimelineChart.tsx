import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  useWindowDimensions,
  Platform,
  ScrollView,
} from "react-native";
import { Colors } from "../../constants/colors";
import type { TimeWindowLite } from "./useAnalyticsDataset";
import type { TrackableLite } from "./useAnalyticsDataset";
import {
  buildBlocksForDay,
  SECONDS_PER_DAY,
  type TimelineBlock,
} from "./timeSpendTimelineUtils";
/* Metro / Expo resolve `./TimeSpendTimelineBlock` to `TimeSpendTimelineBlock.web.tsx` on web. */
import { TimeSpendTimelineBlock } from "./TimeSpendTimelineBlock";

/**
 * Vertical wall-clock strip shared across calendar days: sessions are
 * positioned from clipped window bounds inside each calendar-day column,
 * with one shared time axis on the left; overlaps stack per column.
 *
 * The axis covers only the hours that have activity (plus an hour either
 * side), not the whole 00:00–24:00 day, so the chart is not mostly empty
 * night. Day labels sit above the columns so they are visible without
 * scrolling to the bottom.
 *
 * Monthly uses horizontal scroll when packed columns would shrink below
 * MIN_COLUMN_WIDTH_DP.
 */

/** Shown when the period has nothing tracked at all. */
const EMPTY_RANGE = { startHour: 8, endHour: 18 };
/** Never show less than this many hours, so one short entry isn't huge. */
const MIN_HOURS_SHOWN = 6;
const DAY_LABEL_HEIGHT = 34;

/** Whole-hour window around the tracked time, padded by an hour each side. */
function visibleHourRange(blocks: TimelineBlock[]): {
  startHour: number;
  endHour: number;
} {
  if (blocks.length === 0) return EMPTY_RANGE;
  let minSec = SECONDS_PER_DAY;
  let maxSec = 0;
  for (const b of blocks) {
    if (b.startSec < minSec) minSec = b.startSec;
    if (b.endSec > maxSec) maxSec = b.endSec;
  }
  let startHour = Math.max(0, Math.floor(minSec / 3600) - 1);
  let endHour = Math.min(24, Math.ceil(maxSec / 3600) + 1);
  while (endHour - startHour < MIN_HOURS_SHOWN) {
    if (startHour > 0) startHour -= 1;
    if (endHour - startHour < MIN_HOURS_SHOWN && endHour < 24) endHour += 1;
  }
  return { startHour, endHour };
}

const AXIS_W_NARROW = 46;
const AXIS_W_WIDE = 54;
const MIN_COLUMN_WIDTH_DP = 42;
const COLUMN_GAP = 4;

function formatHourBoundary(h: number): string {
  if (h <= 0) return "00:00";
  if (h >= 24) return "24:00";
  return `${String(h).padStart(2, "0")}:00`;
}

function axisTickTranslateY(h: number, first: number, last: number): number {
  if (h === first) return 0;
  if (h === last) return -11;
  return -6;
}

function pxPerHourForWidth(chartWidthDp: number): number {
  return chartWidthDp < 380 ? 32 : chartWidthDp < 720 ? 36 : 42;
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
  /** Same ladder as calendar `displayTitle` / `timeWindowCalendarDisplayTitle`. */
  getCalendarDisplayTitle: (w: TimeWindowLite) => string;
  fallbackColour: string;
  dayLabel: (dayYYYYMMDD: string) => string;
}

export function TimeSpendTimelineChart({
  days,
  timeWindows,
  resolveTrackableId,
  trackables,
  getCalendarDisplayTitle,
  fallbackColour,
  dayLabel,
}: TimeSpendTimelineChartProps) {
  const { width: winW } = useWindowDimensions();
  const [layoutW, setLayoutW] = useState<number | null>(null);

  const onWrapLayout = useCallback(
    (e: { nativeEvent: { layout: { width: number } } }) => {
      setLayoutW(e.nativeEvent.layout.width);
    },
    [],
  );

  const dayColumnsData = useMemo(() => {
    return days.map((day) => {
      const blocks = sortBlocksForOverlapDraw(
        buildBlocksForDay(
          timeWindows,
          day,
          resolveTrackableId,
          trackables,
          fallbackColour,
          getCalendarDisplayTitle,
        ),
      );
      return { day, blocks };
    });
  }, [
    days,
    timeWindows,
    resolveTrackableId,
    trackables,
    fallbackColour,
    getCalendarDisplayTitle,
  ]);

  const { startHour, endHour } = useMemo(
    () => visibleHourRange(dayColumnsData.flatMap((d) => d.blocks)),
    [dayColumnsData],
  );

  if (!days.length) {
    return null;
  }

  const hoursShown = endHour - startHour;
  const rangeStartSec = startHour * 3600;
  const rangeSec = hoursShown * 3600;
  const hourBoundaries = Array.from(
    { length: hoursShown + 1 },
    (_, i) => startHour + i,
  );
  const hourPct = (h: number) => ((h - startHour) / hoursShown) * 100;
  // One day needs no column label: the page header already names it.
  const dayLabelHeight = days.length > 1 ? DAY_LABEL_HEIGHT : 0;

  const chartOuterW =
    typeof layoutW === "number" && layoutW > 0 ? layoutW : winW;
  const axisW = chartOuterW < 400 ? AXIS_W_NARROW : AXIS_W_WIDE;
  const axisPadRight = 8;
  const axisStripW = axisW + axisPadRight;

  const trackHeight = pxPerHourForWidth(chartOuterW) * hoursShown;
  const compactAxis = chartOuterW < 400;

  const nCols = Math.max(days.length, 1);
  const trackAreaAvail = Math.max(0, chartOuterW - axisStripW);

  const equalCols = nCols >= 1 ? trackAreaAvail / nCols : 0;
  const needsHorizontalScroll =
    nCols >= 2 &&
    nCols * MIN_COLUMN_WIDTH_DP + (nCols - 1) * COLUMN_GAP >
      trackAreaAvail + 1e-3;

  const columnWidthDp = needsHorizontalScroll
    ? MIN_COLUMN_WIDTH_DP
    : equalCols || trackAreaAvail;

  const scrollContentMinW =
    nCols <= 1
      ? trackAreaAvail
      : needsHorizontalScroll
        ? nCols * columnWidthDp + (nCols - 1) * COLUMN_GAP
        : trackAreaAvail;

  const ColumnsRow = (
    <View
      style={{
        flexDirection: "row",
        flexShrink: needsHorizontalScroll ? 0 : 1,
        flexGrow: needsHorizontalScroll ? 0 : 1,
        gap: COLUMN_GAP,
        minWidth:
          needsHorizontalScroll && scrollContentMinW > 0
            ? scrollContentMinW
            : undefined,
      }}
    >
      {dayColumnsData.map(({ day, blocks }) => (
        <View
          key={day}
          style={[
            styles.dayTrackColumnOuter,
            needsHorizontalScroll
              ? { width: columnWidthDp, flexShrink: 0 }
              : { flex: 1, flexBasis: 0, minWidth: 0 },
          ]}
        >
          {dayLabelHeight > 0 ? (
            <Text
              style={[styles.columnLabel, { height: dayLabelHeight }]}
              numberOfLines={2}
            >
              {dayLabel(day)}
            </Text>
          ) : null}
          <View
            style={[
              styles.timelineInner,
              Platform.OS === "web"
                ? ({ userSelect: "none" } as object)
                : null,
            ]}
          >
            <View
              style={[styles.trackColumn, { height: trackHeight }]}
              accessibilityLabel={`Timeline ${day}`}
            >
              <View style={styles.grid} pointerEvents="none">
                {hourBoundaries.map((h) => (
                  <View
                    key={`g-${day}-${h}`}
                    style={[
                      styles.hourLine,
                      {
                        top: `${hourPct(h)}%`,
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
                const topPct = ((b.startSec - rangeStartSec) / rangeSec) * 100;
                const heightPct = Math.max(
                  (span / rangeSec) * 100,
                  minHeightPct,
                );
                return (
                  <TimeSpendTimelineBlock
                    key={`${day}-${b.windowId}`}
                    accessibilityLabel={`${b.displayTitle}, ${b.segmentTimeRangeLabel}`}
                    displayTitle={b.displayTitle}
                    segmentTimeRangeLabel={b.segmentTimeRangeLabel}
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

  return (
    <View style={styles.wrap} onLayout={onWrapLayout}>
      <View style={styles.chartRow}>
        <View style={{ width: axisStripW, flexShrink: 0 }}>
          <View style={{ height: dayLabelHeight }} />
          <View
            style={[styles.axisCol, { width: axisStripW, height: trackHeight }]}
          >
            {hourBoundaries.map((h) => (
              <Text
                key={h}
                style={[
                  styles.axisTick,
                  compactAxis && styles.axisTickCompact,
                  {
                    top: `${hourPct(h)}%`,
                    transform: [
                      { translateY: axisTickTranslateY(h, startHour, endHour) },
                    ],
                  },
                ]}
              >
                {formatHourBoundary(h)}
              </Text>
            ))}
          </View>
          <View style={{ height: 12 }} />
        </View>

        {needsHorizontalScroll ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator
            nestedScrollEnabled
            style={styles.colsScrollShell}
            contentContainerStyle={styles.colsScrollInner}
          >
            {ColumnsRow}
          </ScrollView>
        ) : (
          <View style={styles.flexColsShell}>{ColumnsRow}</View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    width: "100%",
    alignSelf: "stretch",
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    width: "100%",
  },
  flexColsShell: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  },
  colsScrollShell: {
    flex: 1,
    minWidth: 0,
  },
  colsScrollInner: {
    flexGrow: 1,
  },
  dayTrackColumnOuter: {
    flexDirection: "column",
    alignItems: "stretch",
  },
  timelineInner: {
    width: "100%",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  axisCol: {
    position: "relative",
    paddingRight: 8,
    flexShrink: 0,
    alignSelf: "flex-start",
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
    width: "100%",
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
  columnLabel: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.textTertiary,
    textAlign: "center",
    lineHeight: 15,
    paddingHorizontal: 2,
  },
});
