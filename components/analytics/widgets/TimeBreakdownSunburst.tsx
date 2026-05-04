import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Pressable,
  LayoutAnimation,
  UIManager,
} from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { Colors } from "../../../constants/colors";
import { formatAggregatedTimeSpanLabel, formatSecondsAsHM } from "../../../lib/dates";
import { DEFAULT_EVENT_COLOR } from "../../../lib/eventColors";
import {
  GROUP_BY_LABEL,
  GroupByMode,
  GroupingLookups,
} from "../../../lib/grouping";
import {
  buildPartitionArcs,
  type PartitionArc,
} from "../../../lib/analytics/sunburstPartition";
import type { TimeWindowLite } from "../useAnalyticsDataset";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CHART = 280;
const CX = CHART / 2;
const CY = CHART / 2;
const R_OUTERMOST = CHART / 2 - 6;
/** Partition geometry inner bound — matches hub circle. */
const HUB_R = 54;
const RING_GAP = 1;

interface ZoomFrame {
  windows: TimeWindowLite[];
  levels: GroupByMode[];
  pathLabels: string[];
}

function polar(cx: number, cy: number, r: number, angleRad: number) {
  const a = angleRad - Math.PI / 2;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
}

function annulusSectorPath(
  cx: number,
  cy: number,
  rInner: number,
  rOuter: number,
  a0: number,
  a1: number
): string {
  if (a1 - a0 < 1e-6 || rOuter <= rInner) return "";
  const p0 = polar(cx, cy, rOuter, a0);
  const p1 = polar(cx, cy, rOuter, a1);
  const p2 = polar(cx, cy, rInner, a1);
  const p3 = polar(cx, cy, rInner, a0);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return [
    `M ${p0.x} ${p0.y}`,
    `A ${rOuter} ${rOuter} 0 ${large} 1 ${p1.x} ${p1.y}`,
    `L ${p2.x} ${p2.y}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${p3.x} ${p3.y}`,
    `Z`,
  ].join(" ");
}

export interface TimeBreakdownSunburstProps {
  timeWindows: TimeWindowLite[];
  totalSecondsDenominator: number;
  groupingLevels: GroupByMode[];
  lookups: GroupingLookups;
  isLoading: boolean;
  resetScheduleKey: string;
  dataSignature: string;
}

export function TimeBreakdownSunburst({
  timeWindows,
  totalSecondsDenominator,
  groupingLevels,
  lookups,
  isLoading,
  resetScheduleKey,
  dataSignature,
}: TimeBreakdownSunburstProps) {
  const [zoomStack, setZoomStack] = useState<ZoomFrame[]>(() => [
    {
      windows: timeWindows,
      levels: groupingLevels,
      pathLabels: [],
    },
  ]);

  const frame = zoomStack[zoomStack.length - 1]!;

  React.useEffect(() => {
    if (isLoading) return;
    setZoomStack([
      {
        windows: timeWindows,
        levels: groupingLevels,
        pathLabels: [],
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- zoom resets on schedule/signature only
  }, [resetScheduleKey, dataSignature, isLoading]);

  const arcs = useMemo(
    () =>
      frame.windows.length === 0 || frame.levels.length === 0
        ? []
        : buildPartitionArcs(frame.windows, frame.levels, lookups, {
            rOuterMax: R_OUTERMOST,
            hubR: HUB_R,
            ringGap: RING_GAP,
          }),
    [frame.windows, frame.levels, lookups]
  );

  const paintArcs = useMemo(
    () => [...arcs].sort((a, b) => a.depth - b.depth),
    [arcs]
  );

  const frameTotalSeconds = useMemo(
    () => frame.windows.reduce((s, w) => s + w.durationSeconds, 0),
    [frame.windows]
  );

  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const hovered = useMemo(
    () => (hoverKey === null ? null : arcs.find((a) => a.key === hoverKey) ?? null),
    [hoverKey, arcs]
  );

  const hoveredTimeWindowSpan = useMemo(() => {
    if (!hovered || hovered.mode !== "time_window") return null;
    return formatAggregatedTimeSpanLabel(hovered.windows);
  }, [hovered]);

  const drill = useCallback((arc: PartitionArc) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoomStack((prev) => {
      const top = prev[prev.length - 1]!;
      if (arc.depth >= top.levels.length - 1) return prev;
      const nextLevels = top.levels.slice(arc.depth + 1);
      if (nextLevels.length === 0) return prev;
      return [
        ...prev,
        {
          windows: arc.windows as TimeWindowLite[],
          levels: nextLevels,
          pathLabels: [...top.pathLabels, arc.label],
        },
      ];
    });
  }, []);

  const popFocus = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoomStack((s) => (s.length <= 1 ? s : s.slice(0, -1)));
  }, []);

  const jumpToCrumb = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setZoomStack((s) => {
      if (index < 0 || index >= s.length - 1) return s;
      return s.slice(0, index + 1);
    });
  }, []);

  const centerTitle =
    zoomStack.length <= 1
      ? "Total"
      : frame.pathLabels[frame.pathLabels.length - 1] ?? "Total";

  const webHoverProps = (key: string) =>
    Platform.OS === "web"
      ? ({
          onMouseEnter: () => setHoverKey(key),
          onMouseLeave: () => setHoverKey(null),
        } as object)
      : {};

  if (isLoading) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>Loading chart…</Text>
      </View>
    );
  }

  if (timeWindows.length === 0 || totalSecondsDenominator <= 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>No time recorded in this period.</Text>
      </View>
    );
  }

  if (groupingLevels.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.muted}>
          Add at least one grouping to view the chart.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.breadcrumbRow}>
        <View style={styles.crumbRow}>
          {zoomStack.map((z, i) => {
            const label =
              i === 0 ? "Total" : z.pathLabels[z.pathLabels.length - 1] ?? "…";
            return (
              <React.Fragment key={`crumb-${i}`}>
                {i > 0 ? <Text style={styles.crumbSep}> › </Text> : null}
                <Pressable
                  onPress={() => jumpToCrumb(i)}
                  disabled={i === zoomStack.length - 1}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Zoom to ${label}`}
                  accessibilityState={{ disabled: i === zoomStack.length - 1 }}
                >
                  <Text
                    style={[
                      styles.crumbText,
                      i === zoomStack.length - 1 && styles.crumbTextActive,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      </View>

      <View style={styles.chartBox}>
        <Svg
          width={CHART}
          height={CHART}
          viewBox={`0 0 ${CHART} ${CHART}`}
          style={styles.svg}
        >
          {paintArcs.map((a) => {
            const fill = a.colour ?? DEFAULT_EVENT_COLOR;
            const dimmed =
              hoverKey !== null && hoverKey !== a.key ? 0.42 : 1;
            const drillable = a.depth < frame.levels.length - 1;
            return (
              <Path
                key={a.key}
                d={annulusSectorPath(
                  CX,
                  CY,
                  a.rInner,
                  a.rOuter,
                  a.a0,
                  a.a1
                )}
                fill={fill}
                fillOpacity={dimmed}
                stroke={Colors.background}
                strokeWidth={1}
                onPress={() => drill(a)}
                {...(Platform.OS === "web" && drillable
                  ? ({ cursor: "pointer" } as object)
                  : {})}
                {...webHoverProps(a.key)}
              />
            );
          })}

          <Circle
            cx={CX}
            cy={CY}
            r={HUB_R - 2}
            fill={Colors.surfaceContainerHigh}
            stroke={Colors.outlineVariant}
            strokeWidth={1}
          />
        </Svg>

        <Pressable
          style={[
            styles.centerOverlay,
            Platform.OS === "web"
              ? { cursor: zoomStack.length > 1 ? "pointer" : "default" }
              : undefined,
          ]}
          onPress={popFocus}
          disabled={zoomStack.length <= 1}
          accessibilityRole="button"
          accessibilityLabel="Zoom out to parent level"
        >
          <Text style={styles.centerTitle} numberOfLines={2}>
            {centerTitle}
          </Text>
          <Text style={styles.centerTime}>
            {formatSecondsAsHM(frameTotalSeconds)}
          </Text>
          {zoomStack.length > 1 ? (
            <Text style={styles.centerHint}>Tap to zoom out</Text>
          ) : (
            <Text style={styles.centerHintMuted}>
              Tap a segment to zoom in
            </Text>
          )}
        </Pressable>
      </View>

      {hovered ? (
        <Text style={styles.tooltip} numberOfLines={5}>
          <Text style={styles.tooltipDim}>{GROUP_BY_LABEL[hovered.mode]}: </Text>
          {hovered.label}
          {hoveredTimeWindowSpan ? (
            <>
              {"\n"}
              <Text style={styles.tooltipRange}>{hoveredTimeWindowSpan}</Text>
            </>
          ) : null}
          {"\n"}
          {formatSecondsAsHM(hovered.seconds)}
          {" · "}
          {totalSecondsDenominator > 0
            ? Math.round((hovered.seconds / totalSecondsDenominator) * 100)
            : 0}
          %
        </Text>
      ) : (
        <Text style={styles.tooltipPlaceholder}> </Text>
      )}
    </View>
  );
}

const CENTER_W = 112;

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    marginBottom: 8,
  },
  chartBox: {
    width: CHART,
    height: CHART,
    position: "relative",
    alignSelf: "center",
  },
  svg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  breadcrumbRow: {
    alignSelf: "stretch",
    marginBottom: 8,
    paddingVertical: 4,
  },
  crumbRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  crumbSep: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginHorizontal: 2,
  },
  crumbText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.primary,
    maxWidth: 120,
  },
  crumbTextActive: {
    color: Colors.text,
    fontWeight: "700",
  },
  centerOverlay: {
    position: "absolute",
    left: CHART / 2 - CENTER_W / 2,
    top: CHART / 2 - CENTER_W / 2,
    width: CENTER_W,
    height: CENTER_W,
    justifyContent: "center",
    alignItems: "center",
  },
  centerTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
    maxWidth: CENTER_W - 8,
  },
  centerTime: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: "700",
    color: Colors.primary,
    textAlign: "center",
  },
  centerHint: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textSecondary,
    textAlign: "center",
  },
  centerHintMuted: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "500",
    color: Colors.textTertiary,
    textAlign: "center",
  },
  tooltip: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
    minHeight: 18,
    alignSelf: "stretch",
    paddingHorizontal: 8,
  },
  tooltipDim: {
    color: Colors.textSecondary,
    fontWeight: "600",
  },
  tooltipRange: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.text,
  },
  tooltipPlaceholder: {
    marginTop: 6,
    minHeight: 18,
  },
  muted: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
});
