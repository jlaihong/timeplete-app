import React, { useMemo } from "react";
import { View, Platform } from "react-native";
import Svg, {
  Polyline,
  Line as SvgLine,
  Circle,
  Text as SvgText,
} from "react-native-svg";
import { Colors } from "../../../constants/colors";

/* ──────────────────────────────────────────────────────────────────── *
 * LineChart — minimal SVG line chart used by the analytics-only
 * widgets. Mirrors productivity-one's `<app-line-chart>` semantics:
 *
 *   - One or more series, each with its own colour and `lineStyle`
 *     ("solid" | "dashed").
 *   - Optional left/right axis labels (right axis used by the dual-
 *     dimension TRACKER widget).
 *   - X labels can be a list of strings (typically day-of-week
 *     letters or month-short names).
 *
 * Kept intentionally small — we don't pull a charting lib because
 * the analytics widgets only need a clean, low-density read.
 * ──────────────────────────────────────────────────────────────────── */

export interface LineSeries {
  name?: string;
  colour: string;
  lineStyle?: "solid" | "dashed";
  /** Y values, one per X tick. `null` means "no point at this X". */
  data: Array<{ x: number; y: number | null }>;
  /** Which axis the series belongs to. */
  axis?: "left" | "right";
}

interface LineChartProps {
  series: LineSeries[];
  height?: number;
  /** Tick labels along the X axis (length = number of buckets). */
  xLabels?: string[];
  /** Optional axis labels rendered top-left / top-right. */
  leftAxisLabel?: string;
  rightAxisLabel?: string;
}

export function LineChart({
  series,
  height = 120,
  xLabels,
  leftAxisLabel,
  rightAxisLabel,
}: LineChartProps) {
  const [width, setWidth] = React.useState(0);

  const chart = useMemo(() => {
    if (width <= 0) return null;
    const padTop = 14;
    const padBottom = xLabels?.length ? 18 : 8;
    const padLeft = 4;
    const padRight = 4;
    const innerW = Math.max(1, width - padLeft - padRight);
    const innerH = Math.max(1, height - padTop - padBottom);

    const xCount = Math.max(
      1,
      ...series.map((s) => s.data.length),
      xLabels?.length ?? 0
    );

    const leftSeries = series.filter((s) => (s.axis ?? "left") === "left");
    const rightSeries = series.filter((s) => s.axis === "right");

    const leftMax = Math.max(
      1,
      ...leftSeries.flatMap((s) =>
        s.data.map((p) => (p.y ?? 0)).filter((y) => Number.isFinite(y))
      )
    );
    const rightMax = Math.max(
      1,
      ...rightSeries.flatMap((s) =>
        s.data.map((p) => (p.y ?? 0)).filter((y) => Number.isFinite(y))
      )
    );

    const xFor = (i: number) => {
      if (xCount === 1) return padLeft + innerW / 2;
      return padLeft + (i / (xCount - 1)) * innerW;
    };
    const yForValue = (v: number, max: number) =>
      padTop + innerH - (Math.max(0, v) / max) * innerH;

    const polyForSeries = (s: LineSeries) => {
      const max = s.axis === "right" ? rightMax : leftMax;
      return s.data
        .map((p, i) =>
          p.y == null ? null : `${xFor(i).toFixed(1)},${yForValue(p.y, max).toFixed(1)}`
        )
        .filter((v): v is string => !!v)
        .join(" ");
    };

    return {
      padTop,
      padBottom,
      padLeft,
      padRight,
      innerW,
      innerH,
      xCount,
      xFor,
      polyForSeries,
      leftMax,
      rightMax,
    };
  }, [width, height, xLabels, series]);

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ width: "100%", height }}
    >
      {chart && (
        <Svg width="100%" height={height}>
          {/* baseline */}
          <SvgLine
            x1={chart.padLeft}
            x2={chart.padLeft + chart.innerW}
            y1={chart.padTop + chart.innerH}
            y2={chart.padTop + chart.innerH}
            stroke={Colors.outlineVariant}
            strokeWidth={1}
          />

          {series.map((s, idx) => {
            const points = chart.polyForSeries(s);
            if (!points) return null;
            const isDashed = s.lineStyle === "dashed";
            return (
              <React.Fragment key={`s-${idx}`}>
                <Polyline
                  points={points}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={2}
                  strokeDasharray={isDashed ? "4 4" : undefined}
                />
                {s.data.map((p, i) =>
                  p.y == null ? null : (
                    <Circle
                      key={`s-${idx}-p-${i}`}
                      cx={chart.xFor(i)}
                      cy={
                        chart.padTop +
                        chart.innerH -
                        (Math.max(0, p.y) /
                          (s.axis === "right" ? chart.rightMax : chart.leftMax)) *
                          chart.innerH
                      }
                      r={2.2}
                      fill={s.colour}
                    />
                  )
                )}
              </React.Fragment>
            );
          })}

          {xLabels?.map((label, i) => (
            <SvgText
              key={`xl-${i}`}
              x={chart.xFor(i)}
              y={height - 4}
              fontSize={9}
              fill={Colors.textTertiary}
              textAnchor="middle"
            >
              {label}
            </SvgText>
          ))}

          {leftAxisLabel ? (
            <SvgText
              x={chart.padLeft}
              y={10}
              fontSize={9}
              fill={Colors.textTertiary}
              textAnchor="start"
            >
              {leftAxisLabel}
            </SvgText>
          ) : null}
          {rightAxisLabel ? (
            <SvgText
              x={chart.padLeft + chart.innerW}
              y={10}
              fontSize={9}
              fill={Colors.textTertiary}
              textAnchor="end"
            >
              {rightAxisLabel}
            </SvgText>
          ) : null}
        </Svg>
      )}
      {Platform.OS === "web" && width === 0 ? (
        // tiny fallback so the layout has measurable width on first render
        <View style={{ width: "100%" }} />
      ) : null}
    </View>
  );
}
