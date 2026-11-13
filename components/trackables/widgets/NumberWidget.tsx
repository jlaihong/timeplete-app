import React from "react";
import { View, StyleSheet } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { GoalStatItem } from "./atoms/GoalStatItem";
import { CompletedBadge } from "./atoms/CompletedBadge";
import {
  computeRequiredRate,
  formatRate,
  isGoalCompleted,
  rateLabel,
} from "./widgetMath";
import type { WidgetBodyProps } from "./types";
import { QuickChip, useQuickLog } from "./quickLog";

/**
 * Mirror of productivity-one's default `goal-widget` block with
 * `trackableType === 'COUNT'`: a single "Add progress" button + lifetime
 * progress bar (`totalDayCount / targetCount`) + today/avg stats. Opens
 * `TrackCountDialog` for the day.
 *
 * Schema-wise, our `NUMBER` type maps 1:1 to productivity-one's `COUNT`.
 *
 * When the goal is met (`totalDayCount >= targetCount`) the stats row is
 * swapped for a `CompletedBadge`, mirroring P1's `@if (isCompleted())`
 * branch in `goal-widget.html`.
 */
export function NumberWidget({ goal, today }: WidgetBodyProps) {
  const quickLog = useQuickLog();
  const target = goal.targetCount ?? 0;
  const todayEntry = goal.weeklyDayCompletion.find(
    (d) => d.dayYYYYMMDD === today
  );
  const completed = isGoalCompleted(goal.totalDayCount, target);
  const required = completed
    ? null
    : computeRequiredRate(goal, goal.totalDayCount, target, "", today);

  return (
    <View
      style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "stretch" }}
    >
      {/* One press adds to today's total. A different amount, day or a
          note goes through the card's "⋯" button. */}
      <View style={styles.quickRow}>
        <QuickChip
          label="+1"
          wide
          accessibilityLabel={`Add 1 to ${goal.name}`}
          onPress={() => void quickLog.addCount(goal, todayEntry)}
        />
      </View>

      {target > 0 && (
        <ProgressBarWithText
          numerator={goal.totalDayCount}
          denominator={target}
          colour={goal.colour}
        />
      )}

      {completed ? (
        <CompletedBadge
          colour={goal.colour}
          current={goal.totalDayCount}
          target={target}
        />
      ) : (
        <View style={styles.statsRow}>
          <GoalStatItem label="total" value={fmt(goal.totalDayCount)} />
          {goal.todayDayCount > 0 && (
            <GoalStatItem label="today" value={`+${fmt(goal.todayDayCount)}`} />
          )}
          {goal.dailyCountAverage > 0 && (
            <GoalStatItem
              label="avg/day"
              value={fmt(goal.dailyCountAverage, 1)}
            />
          )}
          {required && (
            <GoalStatItem
              label={rateLabel(required)}
              value={formatRate(required.value)}
            />
          )}
        </View>
      )}
    </View>
  );
}

function fmt(n: number, decimals = 0): string {
  if (!isFinite(n)) return "0";
  return n.toFixed(decimals).replace(/\.0+$/, "");
}

const styles = StyleSheet.create({
  // Centred: a lone button hugging the left edge looked stranded.
  quickRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignSelf: "stretch",
  },
});
