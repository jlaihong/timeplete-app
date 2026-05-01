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
 * (`totalDayCount /` total commitment: `targetNumberOfDaysAWeek ×
 * targetNumberOfWeeks` when weeks is set, else P1 grace weeks — see
 * `getEffectiveCumulativeTarget`). The bar uses `periodicOverallProgress`
 * (per-week capped day credits through today) so extra days beyond the
 * weekly quota do not inflate the numerator.
 * Tapping a day opens `TrackPeriodicDialog` for that day.
 */
export function DaysAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const target = goal.targetNumberOfDaysAWeek ?? 0;
  const overallTarget = getEffectiveCumulativeTarget({
    trackableType: "DAYS_A_WEEK",
    startDayYYYYMMDD: goal.startDayYYYYMMDD,
    endDayYYYYMMDD: goal.endDayYYYYMMDD,
    targetNumberOfDaysAWeek: goal.targetNumberOfDaysAWeek,
    targetNumberOfWeeks: goal.targetNumberOfWeeks,
  });
  const overallNumerator =
    typeof goal.periodicOverallProgress === "number" &&
    Number.isFinite(goal.periodicOverallProgress)
      ? goal.periodicOverallProgress
      : 0;

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
          numerator={overallNumerator}
          denominator={overallTarget}
          colour={goal.colour}
        />
      )}
    </View>
  );
}
