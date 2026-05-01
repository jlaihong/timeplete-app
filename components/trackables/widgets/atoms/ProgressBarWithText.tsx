import React from "react";
import { View, Text, StyleSheet, ViewStyle, StyleProp } from "react-native";
import { Colors } from "../../../../constants/colors";

interface ProgressBarWithTextProps {
  numerator: number;
  denominator: number;
  colour: string;
  /** Optional formatter for both numerator and denominator. */
  format?: (n: number) => string;
  /** Caption above the fraction row (e.g. "This week" / "Overall"). */
  caption?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * Mirror of productivity-one's `<app-progress-bar-with-text>` — a label row
 * showing "<n>/<d>" above a coloured horizontal bar.
 *
 * `progress-bar-with-text.html` (productivity-one):
 *   <span class="mb-0.5">{{ formattedNumerator() }}/{{ formattedDenominator() }}</span>
 *   <mat-progress-bar [value]="progressValue()" />
 */
export function ProgressBarWithText({
  numerator,
  denominator,
  colour,
  format,
  caption,
  style,
}: ProgressBarWithTextProps) {
  const fmt = format ?? defaultFormat;
  const safeNum = Number.isFinite(numerator) ? numerator : 0;
  const safeDenom =
    Number.isFinite(denominator) && denominator > 0 ? denominator : 1;
  const pct = Math.min(100, Math.max(0, (safeNum / safeDenom) * 100));
  return (
    <View style={[styles.container, style]}>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      <Text style={styles.label}>
        {fmt(safeNum)}/{fmt(safeDenom)}
      </Text>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${pct}%`, backgroundColor: colour },
          ]}
        />
      </View>
    </View>
  );
}

function defaultFormat(n: number): string {
  if (!Number.isFinite(n)) return "0";
  // 1 decimal, trailing ".0" stripped — matches productivity-one's
  // `formatNumber()` helper inside ProgressBarWithText.
  const rounded = Math.round(n * 10) / 10;
  const str = rounded.toFixed(1);
  return str.endsWith(".0") ? str.slice(0, -2) : str;
}

const styles = StyleSheet.create({
  container: { width: "100%", alignSelf: "stretch" },
  caption: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    marginBottom: 2,
    textAlign: "center",
  },
  label: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginBottom: 4,
    textAlign: "center",
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceVariant,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
