import React from "react";
import { View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { GoalStatItem } from "./atoms/GoalStatItem";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import { Button } from "../../ui/Button";
import { Colors } from "../../../constants/colors";
import type { WidgetBodyProps } from "./types";

/**
 * Mirror of productivity-one's default `goal-widget` block with
 * `trackableType === 'TRACKER'`: optional timer (when `trackTime !== false`)
 * + "Add progress" button + two stat rows (count metrics, time metrics).
 *
 * Stats rows are conditional on `trackCount` / `trackTime` flags — same as
 * productivity-one. NO main `currentValue` progress bar.
 */
export function TrackerWidget({ goal, today, onRequestLog }: WidgetBodyProps) {
  const trackTime = goal.trackTime !== false;
  const trackCount = goal.trackCount !== false;

  const totalHours = goal.totalTimeSeconds / 3600;
  const todayHours = goal.todaySeconds / 3600;
  const avgHours = goal.dailyTimeAverageSeconds / 3600;

  return (
    <View
      style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "center" }}
    >
      <View style={styles.actionsRow}>
        {trackTime && <WidgetTimerRow trackableId={goal._id} />}
        <Button
          title="Add progress"
          variant="secondary"
          onPress={() =>
            onRequestLog({ kind: "tracker", goal, dayYYYYMMDD: today })
          }
          icon={<Ionicons name="add" size={16} color={Colors.text} />}
          style={styles.addBtn}
        />
      </View>

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
    justifyContent: "center",
    gap: 10,
    alignSelf: "stretch",
  },
  addBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    flexShrink: 1,
  },
  statsRow: {
    flexDirection: "row",
    gap: 18,
    flexWrap: "wrap",
    justifyContent: "center",
    alignSelf: "stretch",
  },
});
