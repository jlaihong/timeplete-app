import React from "react";
import { View, StyleSheet } from "react-native";
import { GoalStatItem } from "./atoms/GoalStatItem";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import type { WidgetBodyProps } from "./types";
import {
  QUICK_TIME_SECONDS,
  QuickChip,
  formatQuickDuration,
  useQuickLog,
} from "./quickLog";

/**
 * Mirror of productivity-one's default `goal-widget` block with
 * `trackableType === 'TRACKER'`: optional timer (when `trackTime !== false`)
 * + "Add progress" button + two stat rows (count metrics, time metrics).
 *
 * Stats rows are conditional on `trackCount` / `trackTime` flags — same as
 * productivity-one. NO main `currentValue` progress bar.
 */
const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export function TrackerWidget({ goal }: WidgetBodyProps) {
  const quickLog = useQuickLog();
  const trackTime = goal.trackTime !== false;
  const trackCount = goal.trackCount !== false;

  const totalHours = goal.totalTimeSeconds / 3600;
  const todayHours = goal.todaySeconds / 3600;
  const avgHours = goal.dailyTimeAverageSeconds / 3600;

  return (
    <View
      style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "stretch" }}
    >
      {/* One-press logging. A rating tracker shows its 1–10 scale right on
          the card; a counter gets "+1"; time gets the usual presets. */}
      {trackCount && goal.isRatingTracker ? (
        <View style={styles.ratingRow}>
          {RATING_VALUES.map((value) => (
            <QuickChip
              key={value}
              compact
              label={String(value)}
              accessibilityLabel={`Rate ${goal.name} ${value} out of 10`}
              onPress={() => void quickLog.addEntry(goal, value, true)}
            />
          ))}
        </View>
      ) : null}
      {trackTime || (trackCount && !goal.isRatingTracker) ? (
        <View
          style={[styles.actionsRow, !trackTime && styles.actionsRowCentred]}
        >
          {trackTime && <WidgetTimerRow trackableId={goal._id} />}
          {trackCount && !goal.isRatingTracker ? (
            <QuickChip
              label="+1"
              wide={!trackTime}
              accessibilityLabel={`Add 1 to ${goal.name}`}
              onPress={() => void quickLog.addEntry(goal, 1, false)}
            />
          ) : null}
          {trackTime
            ? QUICK_TIME_SECONDS.map((seconds) => (
                <QuickChip
                  key={seconds}
                  label={formatQuickDuration(seconds)}
                  accessibilityLabel={`Log ${formatQuickDuration(seconds)} to ${goal.name}`}
                  onPress={() => void quickLog.addTime(goal, seconds)}
                />
              ))
            : null}
        </View>
      ) : null}

      {trackCount && (
        <View style={styles.statsRow}>
          {goal.isCumulative && (
            <GoalStatItem label="total" value={fmt(goal.totalEntryCount)} />
          )}
          {goal.todayEntryCount > 0 && (
            <GoalStatItem
              label="today"
              value={
                goal.isCumulative
                  ? `+${fmt(goal.todayEntryCount, 1)}`
                  : `${fmt(goal.todayEntryCount, 1)} avg`
              }
            />
          )}
          {goal.dailyCountAverage > 0 && (
            <GoalStatItem
              label="avg/day"
              value={fmt(goal.dailyCountAverage, 1)}
            />
          )}
        </View>
      )}

      {trackTime && (
        <View style={styles.statsRow}>
          <GoalStatItem label="hrs total" value={fmt(totalHours, 1)} />
          {todayHours > 0 && (
            <GoalStatItem
              label="hrs today"
              value={`+${fmt(todayHours, 1)}`}
            />
          )}
          {avgHours > 0 && (
            <GoalStatItem label="hrs/day avg" value={fmt(avgHours, 1)} />
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
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    flexWrap: "wrap",
    alignSelf: "stretch",
  },
  actionsRowCentred: { justifyContent: "center" },
  // Wraps on phones, where each chip claims a fifth of the row.
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
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
