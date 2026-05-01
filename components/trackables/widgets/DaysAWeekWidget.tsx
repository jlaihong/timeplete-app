import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { getEffectiveCumulativeTarget } from "../../../lib/requiredProgress";
import type { WidgetBodyProps } from "./types";

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_DAYS_A_WEEK` frequency: 7-day pill + weekly progress bar
 * (`currentWeekCompletedDays / targetNumberOfDaysAWeek`) + lifetime bar
 * (`totalDayCount /` projected total from `required-progress.utils.ts`).
 * Tapping a day opens `TrackPeriodicDialog` for that day.
 */
export function DaysAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const target = goal.targetNumberOfDaysAWeek ?? 0;
  const overallTarget = getEffectiveCumulativeTarget({
    trackableType: "DAYS_A_WEEK",
    startDayYYYYMMDD: goal.startDayYYYYMMDD,
    endDayYYYYMMDD: goal.endDayYYYYMMDD,
    targetNumberOfDaysAWeek: goal.targetNumberOfDaysAWeek,
  });

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
        caption="This week"
        numerator={goal.currentWeekCompletedDays}
        denominator={target || 1}
        colour={goal.colour}
      />
      {overallTarget > 0 && (
        <ProgressBarWithText
          caption="Overall"
          numerator={goal.totalDayCount}
          denominator={overallTarget}
          colour={goal.colour}
        />
      )}
    </View>
  );
}
