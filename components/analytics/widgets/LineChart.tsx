import React, { useMemo } from "react";
import { View, Text, Platform, StyleSheet } from "react-native";
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
 *     ("solid" | "dashed" — dashed is used for the goal/required line).
 *   - Optional left/right axis (right axis used by the dual-dimension
 *     TRACKER widget).
 *   - X labels can be a list of strings (typically day-of-week letters
 *     or month-short names).
 *   - Y axis tick labels (3 ticks per active axis) so the reader can
 *     see the magnitude at a glance.
 *   - Point-value labels on the max + last point of each non-dashed
 *     series, so dense or near-flat cumulative lines stay readable.
 *   - Auto Y-scale: the axis range hugs the data instead of always
 *     anchoring to 0. This is what makes 449 → 489 look like a real
 *     slope instead of a flat line at the top of the chart.
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
  /**
   * "auto" (default): Y range hugs the data — axis floor sits just
   * below the min observed value (clamped at 0 for non-negative data).
   * Required for cumulative charts where the meaningful change is
   * tiny relative to the absolute total (e.g. 449 → 489 hrs across
   * a week).
   *
   * "from-zero": Always anchor the floor at 0. Use when comparing
   * absolute magnitudes matters more than highlighting deltas.
   */
  yScale?: "auto" | "from-zero";
  /** Format Y values for the left axis ticks + on-chart labels. */
  formatLeftValue?: (n: number) => string;
  /** Format Y values for the right axis ticks + on-chart labels. */
  formatRightValue?: (n: number) => string;
  /**
   * When true (default), label the max + last point of each
   * non-dashed series with its formatted value. Dashed series
   * (e.g. the "Required" goal line) are intentionally NOT labelled —
   * they're a visual reference, not a data series.
   */
  showPointValues?: boolean;
}

/* Default tick formatter — readable across magnitudes:
 *   ≥ 100 → integer ("440", "500")
 *   ≥ 10  → 1 decimal ("12.5")
 *   <  10 → up to 2 decimals, trimmed ("5.1", "0.5", "0")             */
function defaultFormat(n: number): string {
  if (!Number.isFinite(n)) return "";
  const a = Math.abs(n);
  if (a >= 100) return Math.round(n).toString();
  if (a >= 10) return n.toFixed(1).replace(/\.0$/, "");
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
}

/* "Nice" number rounding — picks the next round value (1, 2, 5, 10
 * × 10^k) so axis ticks land on values a human would actually pick.
 * Adapted from Heckbert's "Nice Numbers for Graph Labels"
 * (Graphics Gems, 1990). */
function niceNum(range: number, round: boolean): number {
  if (range <= 0) return 1;
  const exp = Math.floor(Math.log10(range));
  const f = range / Math.pow(10, exp);
  let nf: number;
  if (round) {
    if (f < 1.5) nf = 1;
    else if (f < 3) nf = 2;
    else if (f < 7) nf = 5;
    else nf = 10;
  } else {
    if (f <= 1) nf = 1;
    else if (f <= 2) nf = 2;
    else if (f <= 5) nf = 5;
    else nf = 10;
  }
  return nf * Math.pow(10, exp);
}

/** Generate nice round tick values across [min, max].
 *  Returns at least 2 ticks; typical output is 3-5. */
function niceTicks(
  min: number,
  max: number,
  desired = 4
): { ticks: number[]; bottom: number; top: number; step: number } {
  if (max <= min) {
    return {
      ticks: [min, max],
      bottom: min,
      top: max,
      step: Math.max(1e-9, max - min),
    };
  }
  const range = niceNum(max - min, false);
  const step = niceNum(range / Math.max(1, desired - 1), true);
  const bottom = Math.floor(min / step) * step;
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  // step * 0.5 epsilon so the top tick lands cleanly even with FP slop.
  for (let v = bottom; v <= top + step * 0.5; v += step) {
    // Round to step granularity to drop FP noise (0.30000000004).
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    ticks.push(Number(v.toFixed(decimals + 2)));
  }
  return { ticks, bottom, top, step };
}

/** Pick axis [bottom, top] + tick values given observed values. */
function pickAxisRange(
  values: number[],
  scale: "auto" | "from-zero"
): { bottom: number; top: number; ticks: number[] } {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { bottom: 0, top: 1, ticks: [0, 1] };
  let min = Math.min(...finite);
  let max = Math.max(...finite);

  if (scale === "from-zero") min = 0;
  // Non-negative-data convention: never let the floor go below 0.
  if (min >= 0) min = Math.max(0, min);

  // Pad raw min/max a touch so the line doesn't sit ON the chart edges.
  if (max === min) {
    if (max === 0) return { bottom: 0, top: 1, ticks: [0, 0.5, 1] };
    const pad = Math.abs(max) * 0.1 || 1;
    min = Math.max(0, min - pad);
    max = max + pad;
  } else {
    const pad = (max - min) * 0.1;
    min = scale === "from-zero" ? 0 : Math.max(0, min - pad);
    max = max + pad;
  }

  const { ticks, bottom, top } = niceTicks(min, max, 4);
  // Clamp to [0, …] when data is non-negative — niceTicks can extend
  // below 0 if min is small (e.g. data 5–8 might produce ticks
  // [-2, 0, 2, …]); clip to start at 0 in that case.
  const safeBottom = scale === "from-zero" ? 0 : Math.max(0, bottom);
  const visibleTicks = ticks.filter((t) => t >= safeBottom - 1e-9);
  return { bottom: safeBottom, top, ticks: visibleTicks };
}

export function LineChart({
  series,
  height = 120,
  xLabels,
  leftAxisLabel,
  rightAxisLabel,
  yScale = "auto",
  formatLeftValue,
  formatRightValue,
  showPointValues = true,
}: LineChartProps) {
  const [width, setWidth] = React.useState(0);

  const fmtLeft = formatLeftValue ?? defaultFormat;
  const fmtRight = formatRightValue ?? defaultFormat;

  const chart = useMemo(() => {
    if (width <= 0) return null;

    const leftSeries = series.filter((s) => (s.axis ?? "left") === "left");
    const rightSeries = series.filter((s) => s.axis === "right");
    const hasLeft = leftSeries.length > 0;
    const hasRight = rightSeries.length > 0;

    const padTop = 18;
    const padBottom = xLabels?.length ? 18 : 8;
    // Reserve room for tick labels — ~28px is enough for "489.0" at fontSize 9.
    const padLeft = hasLeft ? 28 : 4;
    const padRight = hasRight ? 28 : 4;
    const innerW = Math.max(1, width - padLeft - padRight);
    const innerH = Math.max(1, height - padTop - padBottom);

    const xCount = Math.max(
      1,
      ...series.map((s) => s.data.length),
      xLabels?.length ?? 0
    );

    const leftValues = leftSeries.flatMap((s) =>
      s.data.map((p) => p.y).filter((y): y is number => y != null && Number.isFinite(y))
    );
    const rightValues = rightSeries.flatMap((s) =>
      s.data.map((p) => p.y).filter((y): y is number => y != null && Number.isFinite(y))
    );

    const leftRange = pickAxisRange(leftValues, yScale);
    const rightRange = pickAxisRange(rightValues, yScale);

    const xFor = (i: number) => {
      if (xCount === 1) return padLeft + innerW / 2;
      return padLeft + (i / (xCount - 1)) * innerW;
    };
    const yForOnAxis = (
      v: number,
      range: { bottom: number; top: number }
    ) => {
      const span = Math.max(1e-9, range.top - range.bottom);
      const clamped = Math.max(range.bottom, Math.min(range.top, v));
      return padTop + innerH - ((clamped - range.bottom) / span) * innerH;
    };
    const yForSeries = (s: LineSeries, v: number) =>
      yForOnAxis(v, s.axis === "right" ? rightRange : leftRange);

    const polyForSeries = (s: LineSeries) =>
      s.data
        .map((p, i) =>
          p.y == null
            ? null
            : `${xFor(i).toFixed(1)},${yForSeries(s, p.y).toFixed(1)}`
        )
        .filter((v): v is string => !!v)
        .join(" ");

    return {
      padTop,
      padBottom,
      padLeft,
      padRight,
      innerW,
      innerH,
      xCount,
      xFor,
      yForOnAxis,
      yForSeries,
      polyForSeries,
      leftRange,
      rightRange,
      hasLeft,
      hasRight,
      leftSeries,
      rightSeries,
    };
  }, [width, height, xLabels, series, yScale]);

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

          {/* Left-axis tick labels — on the "nice" round values from
           * niceTicks(). Each non-bottom tick gets a faint dashed
           * grid-line so the eye can connect a number to a point. */}
          {chart.hasLeft &&
            chart.leftRange.ticks.map((tick, i) => {
              const y = chart.yForOnAxis(tick, chart.leftRange);
              const isBaseline = Math.abs(y - (chart.padTop + chart.innerH)) < 0.5;
              return (
                <React.Fragment key={`lt-${i}`}>
                  {!isBaseline && (
                    <SvgLine
                      x1={chart.padLeft}
                      x2={chart.padLeft + chart.innerW}
                      y1={y}
                      y2={y}
                      stroke={Colors.outlineVariant}
                      strokeWidth={0.5}
                      strokeDasharray="2 3"
                      opacity={0.5}
                    />
                  )}
                  <SvgText
                    x={chart.padLeft - 4}
                    y={y + 3}
                    fontSize={9}
                    fill={Colors.textTertiary}
                    textAnchor="end"
                  >
                    {fmtLeft(tick)}
                  </SvgText>
                </React.Fragment>
              );
            })}

          {/* Right-axis tick labels (no grid-lines — the left axis
           * already provides them and we don't want a tartan effect). */}
          {chart.hasRight &&
            chart.rightRange.ticks.map((tick, i) => {
              const y = chart.yForOnAxis(tick, chart.rightRange);
              return (
                <SvgText
                  key={`rt-${i}`}
                  x={chart.padLeft + chart.innerW + 4}
                  y={y + 3}
                  fontSize={9}
                  fill={Colors.textTertiary}
                  textAnchor="start"
                >
                  {fmtRight(tick)}
                </SvgText>
              );
            })}

          {series.map((s, idx) => {
            const points = chart.polyForSeries(s);
            if (!points) return null;
            const isDashed = s.lineStyle === "dashed";
            const fmt = s.axis === "right" ? fmtRight : fmtLeft;

            // Label only the last non-null point of each non-dashed
            // series. The max+last pair caused visual collisions on
            // cumulative lines (max usually IS the last point) — see
            // the "449.9h449" complaint. The summary text below the
            // chart already covers the per-period max.
            const labelIndices = new Set<number>();
            if (showPointValues && !isDashed) {
              let lastIdx = -1;
              s.data.forEach((p, i) => {
                if (p.y == null || !Number.isFinite(p.y)) return;
                lastIdx = i;
              });
              if (lastIdx >= 0) labelIndices.add(lastIdx);
            }

            return (
              <React.Fragment key={`s-${idx}`}>
                <Polyline
                  points={points}
                  fill="none"
                  stroke={s.colour}
                  strokeWidth={2}
                  strokeDasharray={isDashed ? "4 4" : undefined}
                />
                {s.data.map((p, i) => {
                  if (p.y == null || !Number.isFinite(p.y)) return null;
                  const cx = chart.xFor(i);
                  const cy = chart.yForSeries(s, p.y);
                  if (!labelIndices.has(i)) {
                    return (
                      <Circle
                        key={`s-${idx}-p-${i}`}
                        cx={cx}
                        cy={cy}
                        r={2.2}
                        fill={s.colour}
                      />
                    );
                  }
                  // Anchor the label so it doesn't overflow chart edges
                  // (the last point sits flush against the right pad).
                  const rightEdge = chart.padLeft + chart.innerW;
                  const nearRight = cx > rightEdge - 24;
                  const nearLeft = cx < chart.padLeft + 24;
                  const anchor: "start" | "middle" | "end" = nearRight
                    ? "end"
                    : nearLeft
                      ? "start"
                      : "middle";
                  // Push label below the dot if it would clip the top.
                  const labelY = cy - 6 < chart.padTop + 4 ? cy + 12 : cy - 6;
                  return (
                    <React.Fragment key={`s-${idx}-p-${i}`}>
                      <Circle cx={cx} cy={cy} r={2.6} fill={s.colour} />
                      <SvgText
                        x={cx}
                        y={labelY}
                        fontSize={10}
                        fill={Colors.text}
                        textAnchor={anchor}
                        fontWeight="600"
                      >
                        {fmt(p.y)}
                      </SvgText>
                    </React.Fragment>
                  );
                })}
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
      <ChartLegend series={series} />
    </View>
  );
}

/* Legend — currently rendered only for dashed series, which (by
 * convention) are the "Required progress" goal lines. Solid series
 * are already labelled by the axis label / surrounding text, so a
 * full legend would be more noise than signal. If we ever add other
 * dashed semantics, generalise this. */
function ChartLegend({ series }: { series: LineSeries[] }) {
  const dashed = series.filter((s) => s.lineStyle === "dashed");
  if (dashed.length === 0) return null;
  // Dedupe by colour — TRACKER widgets emit one dashed series per axis
  // (count + hours), but they're the same visual concept so a single
  // legend entry per colour is enough.
  const seen = new Set<string>();
  const unique = dashed.filter((s) => {
    if (seen.has(s.colour)) return false;
    seen.add(s.colour);
    return true;
  });
  return (
    <View style={legendStyles.row}>
      {unique.map((s, i) => (
        <View key={`leg-${i}`} style={legendStyles.item}>
          <DashedSwatch colour={s.colour} />
          <Text style={legendStyles.label}>
            {s.name === "Required" ? "Required progress" : (s.name ?? "Goal")}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* Tiny inline SVG so the swatch matches the chart's dashed style
 * exactly (4 4 dasharray, 2px stroke). */
function DashedSwatch({ colour }: { colour: string }) {
  return (
    <Svg width={20} height={6}>
      <SvgLine
        x1={0}
        y1={3}
        x2={20}
        y2={3}
        stroke={colour}
        strokeWidth={2}
        strokeDasharray="4 4"
      />
    </Svg>
  );
}

const legendStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 12,
    marginTop: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
  },
});
