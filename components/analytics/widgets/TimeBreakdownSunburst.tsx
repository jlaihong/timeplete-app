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
import { Colors, TRACKABLE_COLORS } from "../../../constants/colors";
import { formatSecondsAsHM } from "../../../lib/dates";
import {
  GROUP_BY_DISPLAY_LABEL,
  GroupByMode,
  GroupedBucket,
  GroupingLookups,
} from "../../../lib/grouping";
import { sunburstRingBuckets } from "../../../lib/analytics/sunburstHierarchy";
import type { TimeWindowLite } from "../useAnalyticsDataset";

if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const CHART = 260;
const CX = CHART / 2;
const CY = CHART / 2;
const R_OUTER = CHART / 2 - 8;
const R_INNER = 56;
const PAD_RAD = 0.012;

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
  if (a1 - a0 < 1e-6) return "";
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

function fallbackColour(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return TRACKABLE_COLORS[h % TRACKABLE_COLORS.length]!;
}

/** Partition ring angles so wedges fill 2π (handles overlapping tag totals). */
function layoutRingAngles(buckets: GroupedBucket[]): { a0: number; a1: number }[] {
  const sum = buckets.reduce((s, b) => s + b.totalSeconds, 0);
  const totalPad = PAD_RAD * buckets.length;
  if (sum <= 0 || buckets.length === 0) {
    return buckets.map(() => ({ a0: 0, a1: 0 }));
  }
  const usable = Math.max(0, 2 * Math.PI - totalPad);
  let acc = 0;
  return buckets.map((b) => {
    const span = (b.totalSeconds / sum) * usable;
    const a0 = acc;
    acc += span + PAD_RAD;
    return { a0, a1: a0 + span };
  });
}

export interface FocusFrame {
  label: string;
  totalSeconds: number;
  windows: TimeWindowLite[];
  /** Drill depth; ring dimension is `groupingLevels[depth]`. */
  depth: number;
}

export interface TimeBreakdownSunburstProps {
  timeWindows: TimeWindowLite[];
  totalSecondsDenominator: number;
  /** Ordered grouping dimensions — ring i uses `groupingLevels[i]`. */
  groupingLevels: GroupByMode[];
  lookups: GroupingLookups;
  isLoading: boolean;
  /** Tab + ordered levels + bounds — drill stack resets when this changes. */
  resetScheduleKey: string;
  /** Cheap fingerprint when the underlying slice meaningfully changes. */
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
  const [stack, setStack] = useState<FocusFrame[]>(() => {
    const secs = timeWindows.reduce((s, w) => s + w.durationSeconds, 0);
    return [
      {
        label: "Total",
        totalSeconds: secs,
        windows: timeWindows,
        depth: 0,
      },
    ];
  });

  const focus = stack[stack.length - 1]!;

  React.useEffect(() => {
    if (isLoading) return;
    const secs = timeWindows.reduce((s, w) => s + w.durationSeconds, 0);
    setStack([
      {
        label: "Total",
        totalSeconds: secs,
        windows: timeWindows,
        depth: 0,
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only on schedule/signature; avoid churn from Convex identity
  }, [resetScheduleKey, dataSignature, isLoading]);

  const buckets: GroupedBucket[] = useMemo(
    () =>
      focus.windows.length === 0
        ? []
        : sunburstRingBuckets(
            focus.windows,
            focus.depth,
            groupingLevels,
            lookups
          ),
    [focus.depth, focus.windows, groupingLevels, lookups]
  );

  const angles = useMemo(() => layoutRingAngles(buckets), [buckets]);

  const [hoverKey, setHoverKey] = useState<string | null>(null);

  const drill = useCallback((b: GroupedBucket) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const secs = b.windows.reduce((s, w) => s + w.durationSeconds, 0);
    setStack((prev) => {
      const top = prev[prev.length - 1]!;
      return [
        ...prev,
        {
          label: b.label,
          totalSeconds: secs,
          windows: b.windows,
          depth: top.depth + 1,
        },
      ];
    });
  }, []);

  const popFocus = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStack((s) => (s.length <= 1 ? s : s.slice(0, -1)));
  }, []);

  const jumpToCrumb = useCallback((index: number) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setStack((s) => {
      if (index < 0 || index >= s.length - 1) return s;
      return s.slice(0, index + 1);
    });
  }, []);

  const hoverBucket =
    hoverKey === null ? null : buckets.find((b) => b.key === hoverKey) ?? null;

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

  const showRing =
    buckets.length > 0 && focus.depth < groupingLevels.length;
  const noFurther =
    focus.depth >= groupingLevels.length ||
    (buckets.length === 0 && focus.depth > 0);

  const ringMode = groupingLevels[focus.depth];
  const ringLabel =
    ringMode !== undefined ? GROUP_BY_DISPLAY_LABEL[ringMode] : "";

  const webHoverProps = (key: string) =>
    Platform.OS === "web"
      ? ({
          onMouseEnter: () => setHoverKey(key),
          onMouseLeave: () => setHoverKey(null),
        } as object)
      : {};

  return (
    <View style={styles.wrap}>
      <View style={styles.breadcrumbRow}>
        <View style={styles.crumbRow}>
          {stack.map((f, i) => (
            <React.Fragment key={`crumb-${i}-${f.label}`}>
              {i > 0 ? (
                <Text style={styles.crumbSep}> › </Text>
              ) : null}
              <Pressable
                onPress={() => jumpToCrumb(i)}
                disabled={i === stack.length - 1}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={`Focus ${f.label}`}
                accessibilityState={{ disabled: i === stack.length - 1 }}
              >
                <Text
                  style={[
                    styles.crumbText,
                    i === stack.length - 1 && styles.crumbTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {f.label}
                </Text>
              </Pressable>
            </React.Fragment>
          ))}
        </View>
      </View>

      <View style={styles.chartBox}>
        <Svg
          width={CHART}
          height={CHART}
          viewBox={`0 0 ${CHART} ${CHART}`}
          style={styles.svg}
        >
          {showRing
            ? buckets.map((b, i) => {
                const { a0, a1 } = angles[i]!;
                const fill = b.colour ?? fallbackColour(b.key);
                const dimmed =
                  hoverKey !== null && hoverKey !== b.key ? 0.45 : 1;
                return (
                  <Path
                    key={b.key}
                    d={annulusSectorPath(CX, CY, R_INNER, R_OUTER, a0, a1)}
                    fill={fill}
                    fillOpacity={dimmed}
                    stroke={Colors.background}
                    strokeWidth={1}
                    onPress={() => drill(b)}
                    {...webHoverProps(b.key)}
                  />
                );
              })
            : null}

          <Circle
            cx={CX}
            cy={CY}
            r={R_INNER - 2}
            fill={Colors.surfaceContainerHigh}
            stroke={Colors.outlineVariant}
            strokeWidth={1}
          />
        </Svg>

        <Pressable
          style={[
            styles.centerOverlay,
            Platform.OS === "web"
              ? { cursor: stack.length > 1 ? "pointer" : "default" }
              : undefined,
          ]}
          onPress={popFocus}
          disabled={stack.length <= 1}
          accessibilityRole="button"
          accessibilityLabel="Zoom out to parent level"
        >
          <Text style={styles.centerTitle} numberOfLines={2}>
            {focus.label}
          </Text>
          <Text style={styles.centerTime}>
            {formatSecondsAsHM(focus.totalSeconds)}
          </Text>
          {stack.length > 1 ? (
            <Text style={styles.centerHint}>Tap to zoom out</Text>
          ) : (
            <Text style={styles.centerHintMuted}>
              Tap a segment to zoom in
            </Text>
          )}
        </Pressable>
      </View>

      {hoverBucket ? (
        <Text style={styles.tooltip} numberOfLines={3}>
          {ringLabel ? (
            <Text style={styles.tooltipDim}>{ringLabel}: </Text>
          ) : null}
          {hoverBucket.label}
          {" · "}
          {formatSecondsAsHM(hoverBucket.totalSeconds)}
          {" · "}
          {totalSecondsDenominator > 0
            ? Math.round(
                (hoverBucket.totalSeconds / totalSecondsDenominator) * 100
              )
            : 0}
          %
        </Text>
      ) : (
        <Text style={styles.tooltipPlaceholder}> </Text>
      )}

      {noFurther ? (
        <Text style={styles.footerNote}>
          {focus.depth >= groupingLevels.length
            ? "End of grouping sequence."
            : "No subdivisions at this level."}
        </Text>
      ) : null}
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
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  tooltipPlaceholder: {
    marginTop: 6,
    minHeight: 18,
  },
  footerNote: {
    marginTop: 6,
    fontSize: 11,
    color: Colors.textTertiary,
    textAlign: "center",
  },
  muted: {
    fontSize: 13,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
});
