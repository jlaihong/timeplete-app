import React, { useMemo } from "react";
import { View, ScrollView, Platform, StyleSheet } from "react-native";
import Svg, { Rect, Line as SvgLine, Text as SvgText } from "react-native-svg";
import { Colors } from "../../constants/colors";

/* ──────────────────────────────────────────────────────────────────── *
 * Stacked bucket bar chart for analytics Time Spend (weekly/monthly).
 *
 * Productivity-one: discrete bar **per calendar day** in one plot, time on
 * the **left Y axis**, X axis labels under each bucket. Stacks use
 * trackable colours (largest slice at stack bottom — same convention as
 * yearly month bars).
 *
 * Padding / grid semantics mirror `widgets/LineChart`.
 * ──────────────────────────────────────────────────────────────────── */

export interface TimeSpendBucket {
  /** YYYYMMDD */
  id: string;
  xLabel: string;
  segments: Array<{ reactKey: string; colour: string; seconds: number }>;
}

export interface TimeSpendBucketBarChartProps {
  buckets: TimeSpendBucket[];
  height?: number;
  /** Top-left caption for the quantitative axis ("Hours"). */
  leftAxisLabel?: string;
}

/** Same heuristic as yearly month strip — long months scroll horizontally. */
const MIN_SLOTS_FOR_SCROLL = 15;
const MIN_SLOT_SCROLL = 24;
const BAR_WIDTH_FRAC_OF_SLOT = 0.62;
const BAR_RX = 3;

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

function niceTicks(min: number, max: number, desired = 4) {
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
  for (let v = bottom; v <= top + step * 0.5; v += step) {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    ticks.push(Number(v.toFixed(decimals + 2)));
  }
  return { ticks, bottom, top, step };
}

/** From-zero hourly axis for stacked day totals (non‑negative durations). */
function axisRangeHours(values: number[]) {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return { bottom: 0, top: 1, ticks: [0, 1] };
  const maxRaw = Math.max(...finite);

  if (maxRaw === 0) {
    return { bottom: 0, top: 1, ticks: [0, 0.5, 1] };
  }
  const max = maxRaw + Math.max(maxRaw * 0.08, 0.05);

  const { ticks, bottom, top } = niceTicks(0, max, 4);
  const safeBottom = Math.max(0, bottom);
  const visibleTicks = ticks.filter((t) => t >= safeBottom - 1e-9);
  return { bottom: safeBottom, top, ticks: visibleTicks };
}

function fmtHoursTick(h: number): string {
  if (!Number.isFinite(h)) return "";
  if (h >= 10) return Math.round(h).toString();
  return h.toFixed(1).replace(/\.0$/, "");
}

export function TimeSpendBucketBarChart({
  buckets,
  height = 172,
  leftAxisLabel = "Hours",
}: TimeSpendBucketBarChartProps) {
  const [viewportW, setViewportW] = React.useState(0);

  const padTop = 18;
  const padBottom = 18;
  const padLeft = 36;
  const padRight = 6;

  const needScroll =
    buckets.length >= MIN_SLOTS_FOR_SCROLL && viewportW > 0;
  const contentW =
    viewportW <= 0
      ? 0
      : Math.max(
          viewportW,
          needScroll ? buckets.length * MIN_SLOT_SCROLL + padLeft + padRight : viewportW,
        );

  const chart = useMemo(() => {
    if (viewportW <= 0 || contentW <= 0) return null;

    const innerW = Math.max(1, contentW - padLeft - padRight);
    const innerH = Math.max(1, height - padTop - padBottom);

    const hoursTotals = buckets.map((b) =>
      b.segments.reduce((s, seg) => s + seg.seconds / 3600, 0),
    );
    const { bottom: axisBot, top: axisTop, ticks } = axisRangeHours(hoursTotals);

    const yFromHours = (h: number) => {
      const span = Math.max(1e-9, axisTop - axisBot);
      const clamped = Math.max(axisBot, Math.min(axisTop, h));
      return padTop + innerH - ((clamped - axisBot) / span) * innerH;
    };
    const baselineY = yFromHours(axisBot);

    const nBars = buckets.length || 1;
    const slotW = innerW / nBars;
    const barW = Math.max(8, slotW * BAR_WIDTH_FRAC_OF_SLOT);

    const bars = buckets.map((b, i) => {
      const totalSec = b.segments.reduce((s, seg) => s + seg.seconds, 0);
      const totalHr = totalSec / 3600;
      const cx = padLeft + (i + 0.5) * slotW;
      const barLeft = cx - barW / 2;
      const segs: { top: number; h: number; fill: string; key: string }[] =
        [];

      let yCursor = baselineY;
      if (totalSec <= 0) {
        return { barLeft, barW, segs };
      }
      const barTopY = yFromHours(totalHr);
      const stackPx = Math.max(baselineY - barTopY, 0);

      for (const seg of b.segments) {
        const frac = seg.seconds / totalSec;
        const pxH = frac * stackPx;
        const top = yCursor - pxH;
        segs.push({
          top,
          h: pxH,
          fill: seg.colour,
          key: `${b.id}-${seg.reactKey}`,
        });
        yCursor -= pxH;
      }
      return { barLeft, barW, segs };
    });

    return {
      padTop,
      padLeft,
      innerW,
      innerH,
      ticks,
      baselineY,
      yFromHours,
      bars,
      contentW,
    };
  }, [buckets, contentW, height, padLeft, padTop, viewportW]);

  const svgWidth = needScroll ? (chart?.contentW ?? viewportW) : viewportW;

  return (
    <View
      style={styles.host}
      onLayout={(e) => setViewportW(e.nativeEvent.layout.width)}
    >
      {viewportW <= 0 && Platform.OS === "web" ? (
        <View style={{ width: "100%" }} />
      ) : null}
      {chart && viewportW > 0 ? (
        <ScrollWrapper horizontal={needScroll}>
          <Svg width={svgWidth} height={height}>
            {/* Y ticks + optional horizontal grids */}
            {chart.ticks.map((tick, i) => {
              const yLine = chart.yFromHours(tick);
              const yText = yLine + 3;
              const isBaseline = Math.abs(yLine - chart.baselineY) < 1;
              return (
                <React.Fragment key={`ay-${tick}-${i}`}>
                  {!isBaseline ? (
                    <SvgLine
                      x1={chart.padLeft}
                      x2={chart.padLeft + chart.innerW}
                      y1={yLine}
                      y2={yLine}
                      stroke={Colors.outlineVariant}
                      strokeWidth={0.5}
                      strokeDasharray="2 3"
                      opacity={0.5}
                    />
                  ) : null}
                  <SvgText
                    x={chart.padLeft - 4}
                    y={yText}
                    fontSize={9}
                    fill={Colors.textTertiary}
                    textAnchor="end"
                  >
                    {fmtHoursTick(tick)}
                  </SvgText>
                </React.Fragment>
              );
            })}

            <SvgLine
              x1={chart.padLeft}
              x2={chart.padLeft + chart.innerW}
              y1={chart.baselineY}
              y2={chart.baselineY}
              stroke={Colors.outlineVariant}
              strokeWidth={1}
            />

            {chart.bars.map((bar) =>
              bar.segs.map((s) => (
                <Rect
                  key={s.key}
                  x={bar.barLeft}
                  y={s.top}
                  width={bar.barW}
                  height={Math.max(s.h, 0)}
                  fill={s.fill}
                  opacity={0.9}
                  rx={BAR_RX}
                  ry={BAR_RX}
                />
              )),
            )}

            {buckets.map((b, i) => {
              const trimmed = (b.xLabel ?? "").trim();
              if (!trimmed) return null;
              const cx =
                chart.padLeft +
                ((i + 0.5) * chart.innerW) / buckets.length;
              return (
                <SvgText
                  key={`xl-${b.id}`}
                  x={cx}
                  y={height - 4}
                  fontSize={9}
                  fill={Colors.textTertiary}
                  textAnchor="middle"
                >
                  {trimmed}
                </SvgText>
              );
            })}

            {leftAxisLabel ? (
              <SvgText
                x={chart.padLeft}
                y={11}
                fontSize={9}
                fill={Colors.textTertiary}
                textAnchor="start"
              >
                {leftAxisLabel}
              </SvgText>
            ) : null}
          </Svg>
        </ScrollWrapper>
      ) : null}
    </View>
  );
}

function ScrollWrapper({
  horizontal,
  children,
}: {
  horizontal: boolean;
  children: React.ReactNode;
}) {
  if (!horizontal) {
    return <View style={{ width: "100%" }}>{children}</View>;
  }
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  host: { width: "100%", marginBottom: 4 },
  scrollContent: { flexGrow: 0 },
});
