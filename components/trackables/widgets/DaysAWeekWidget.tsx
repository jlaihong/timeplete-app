import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { getPeriodicCommittedWeekCount } from "../../../lib/requiredProgress";
import type { WidgetBodyProps } from "./types";

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_DAYS_A_WEEK` frequency: 7-day pill + weekly progress bar
 * (sum of `numCompleted` this week / `targetNumberOfDaysAWeek`, matching P1
 * `countWeeklyTotal`) + **overall**
 * bar on a **week count** scale (`periodicOverallProgress /
 * targetNumberOfDaysAWeek` vs `getPeriodicCommittedWeekCount`), matching
 * P1's second bar (not raw day-slots `days × weeks`).
 * Tapping a day opens `TrackPeriodicDialog` for that day.
 */
export function DaysAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const target = goal.targetNumberOfDaysAWeek ?? 0;
  /** Same as P1 `GoalWidgetPeriodic.countWeeklyTotal` — sum of `numCompleted` across the week. */
  const weeklyCompletionSum = goal.weeklyDayCompletion.reduce(
    (s, d) => s + d.numCompleted,
    0
  );
  const overallWeeksDenom = getPeriodicCommittedWeekCount({
    trackableType: "DAYS_A_WEEK",
    startDayYYYYMMDD: goal.startDayYYYYMMDD,
    endDayYYYYMMDD: goal.endDayYYYYMMDD,
    targetNumberOfWeeks: goal.targetNumberOfWeeks,
  });
  const dayCredits =
    typeof goal.periodicOverallProgress === "number" &&
    Number.isFinite(goal.periodicOverallProgress)
      ? goal.periodicOverallProgress
      : 0;
  const overallWeeksNumerator = target > 0 ? dayCredits / target : 0;

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
        numerator={weeklyCompletionSum}
        denominator={target || 1}
        colour={goal.colour}
      />
      {overallWeeksDenom > 0 && target > 0 && (
        <ProgressBarWithText
          caption="Overall"
          numerator={overallWeeksNumerator}
          denominator={overallWeeksDenom}
          colour={goal.colour}
        />
      )}
    </View>
  );
}
