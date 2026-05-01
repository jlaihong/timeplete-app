import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import { getEffectiveCumulativeTarget } from "../../../lib/requiredProgress";
import type { WidgetBodyProps } from "./types";

const minutesFormat = (n: number) => `${Math.round(n)}m`;

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_MINUTES_A_WEEK` frequency: timer row + 7-day pill + weekly progress
 * bar (`weeklyMinutes / targetNumberOfMinutesAWeek`) + lifetime bar (total
 * minutes / projected total from `required-progress.utils.ts`). Tapping a day
 * opens `TrackTimeDialog` for that day.
 */
export function MinutesAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const targetMinutes = goal.targetNumberOfMinutesAWeek ?? 0;
  const weekMinutes = Math.floor(goal.weeklySeconds / 60);
  const lifetimeMinutes = Math.floor(goal.totalTimeSeconds / 60);
  const overallTarget = getEffectiveCumulativeTarget({
    trackableType: "MINUTES_A_WEEK",
    startDayYYYYMMDD: goal.startDayYYYYMMDD,
    endDayYYYYMMDD: goal.endDayYYYYMMDD,
    targetNumberOfMinutesAWeek: goal.targetNumberOfMinutesAWeek,
  });

  return (
    <View style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "center" }}>
      <WidgetTimerRow trackableId={goal._id} />
      <DayOfWeekCompletion
        days={goal.weeklyDayCompletion}
        colour={goal.colour}
        onDayPress={(day) =>
          onRequestLog({ kind: "time", goal, dayYYYYMMDD: day })
        }
      />
      <ProgressBarWithText
        caption="This week"
        numerator={weekMinutes}
        denominator={targetMinutes || 1}
        colour={goal.colour}
        format={minutesFormat}
      />
      {overallTarget > 0 && (
        <ProgressBarWithText
          caption="Overall"
          numerator={lifetimeMinutes}
          denominator={overallTarget}
          colour={goal.colour}
          format={minutesFormat}
        />
      )}
    </View>
  );
}
