import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import type { WidgetBodyProps } from "./types";

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_MINUTES_A_WEEK` frequency: timer row + 7-day pill + weekly progress
 * bar (`weeklyMinutes / targetNumberOfMinutesAWeek`). Tapping a day opens
 * `TrackTimeDialog` for that day.
 */
export function MinutesAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const targetMinutes = goal.targetNumberOfMinutesAWeek ?? 0;
  const weekMinutes = Math.floor(goal.weeklySeconds / 60);

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
        numerator={weekMinutes}
        denominator={targetMinutes || 1}
        colour={goal.colour}
        format={(n) => `${n}m`}
      />
    </View>
  );
}
