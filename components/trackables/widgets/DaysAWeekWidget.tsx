import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import type { WidgetBodyProps } from "./types";

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_DAYS_A_WEEK` frequency: 7-day pill + weekly progress bar
 * (`currentWeekCompletedDays / targetNumberOfDaysAWeek`). Tapping a day opens
 * `TrackPeriodicDialog` for that day.
 */
export function DaysAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const target = goal.targetNumberOfDaysAWeek ?? 0;

  return (
    <View style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "center" }}>
      <DayOfWeekCompletion
        days={goal.weeklyDayCompletion}
        colour={goal.colour}
        onDayPress={(day) => {
          const entry = goal.weeklyDayCompletion.find(
            (d) => d.dayYYYYMMDD === day
          );
          onRequestLog({
            kind: "periodic",
            goal,
            dayYYYYMMDD: day,
            initialNumCompleted: entry?.numCompleted ?? 0,
            initialComments: entry?.comments ?? "",
          });
        }}
      />
      <ProgressBarWithText
        numerator={goal.currentWeekCompletedDays}
        denominator={target || 1}
        colour={goal.colour}
      />
    </View>
  );
}
