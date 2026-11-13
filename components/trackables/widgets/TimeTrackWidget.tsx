import React from "react";
import { View, StyleSheet } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import { GoalStatItem } from "./atoms/GoalStatItem";
import { CompletedBadge } from "./atoms/CompletedBadge";
import {
  computeRequiredRate,
  formatRate,
  isGoalCompleted,
  rateLabel,
} from "./widgetMath";
import type { WidgetBodyProps } from "./types";
import {
  QUICK_TIME_SECONDS,
  QuickChip,
  formatQuickDuration,
  useQuickLog,
} from "./quickLog";

/**
 * Mirror of productivity-one's default `goal-widget` block with
 * `trackableType === 'TIME_TRACK'`: timer row + lifetime progress bar
 * (hours) + an "Add progress" button that opens `TrackTimeDialog`.
 *
 * When the goal is met (`totalHours >= targetHours`) the stats row is
 * swapped for a `CompletedBadge`, mirroring P1's `@if (isCompleted())`
 * branch in `goal-widget.html`.
 */
export function TimeTrackWidget({ goal, today }: WidgetBodyProps) {
  const quickLog = useQuickLog();
  const targetHours = goal.targetNumberOfHours ?? 0;
  const totalHours = goal.totalTimeSeconds / 3600;
  const todayHours = goal.todaySeconds / 3600;
  const avgHours = goal.dailyTimeAverageSeconds / 3600;
  const completed = isGoalCompleted(totalHours, targetHours);
  const required = completed
    ? null
    : computeRequiredRate(goal, totalHours, targetHours, "h", today);

  return (
    <View
      style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "stretch" }}
    >
      <View style={styles.actionsRow}>
        <WidgetTimerRow trackableId={goal._id} />
        {/* Time already spent, ending now: one press. */}
        {QUICK_TIME_SECONDS.map((seconds) => (
          <QuickChip
            key={seconds}
            label={formatQuickDuration(seconds)}
            accessibilityLabel={`Log ${formatQuickDuration(seconds)} to ${goal.name}`}
            onPress={() => void quickLog.addTime(goal, seconds)}
          />
        ))}
      </View>

      {targetHours > 0 && (
        <ProgressBarWithText
          numerator={totalHours}
          denominator={targetHours || 1}
          colour={goal.colour}
          format={(n) => `${fmtHours(n)}h`}
        />
      )}

      {completed ? (
        <CompletedBadge
          colour={goal.colour}
          current={totalHours}
          target={targetHours}
          unitSuffix="h"
        />
      ) : (
        <View style={styles.statsRow}>
          <GoalStatItem label="hrs total" value={fmtHours(totalHours)} />
          {todayHours > 0 && (
            <GoalStatItem label="hrs today" value={`+${fmtHours(todayHours)}`} />
          )}
          {avgHours > 0 && (
            <GoalStatItem label="hrs/day avg" value={fmtHours(avgHours)} />
          )}
          {required && (
            <GoalStatItem
              label={rateLabel(required)}
              value={`${formatRate(required.value)}${required.suffix}`}
            />
          )}
        </View>
      )}
    </View>
  );
}

function fmtHours(n: number): string {
  if (!isFinite(n)) return "0";
  const r = Math.round(n * 10) / 10;
  return r.toFixed(1).replace(/\.0$/, "");
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    flexWrap: "wrap",
    alignSelf: "stretch",
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignSelf: "stretch",
  },
});
