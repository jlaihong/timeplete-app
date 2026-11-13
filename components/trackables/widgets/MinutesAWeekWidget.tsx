import React from "react";
import { View } from "react-native";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import { getPeriodicCommittedWeekCount } from "../../../lib/requiredProgress";
import type { WidgetBodyProps } from "./types";
import {
  QUICK_TIME_SECONDS,
  QuickChip,
  formatQuickDuration,
  useQuickLog,
} from "./quickLog";

const minutesFormat = (n: number) => `${Math.round(n)}m`;

/**
 * Mirror of productivity-one's `GoalWidgetPeriodic` with the
 * `COUPLE_MINUTES_A_WEEK` frequency: timer row + 7-day pill + weekly progress
 * bar (`weeklyMinutes / targetNumberOfMinutesAWeek`) + **overall** bar:
 * successful full weeks (weekly minutes meeting target) × target, divided
 * back by target for the numerator — P1 `currentValue / targetValue` on weeks.
 * The weekly bar still uses `Xm`; overall uses the default numeric formatter.
 * Tapping a day opens `TrackTimeDialog` for that day.
 */
export function MinutesAWeekWidget({ goal, onRequestLog }: WidgetBodyProps) {
  const quickLog = useQuickLog();
  const targetMinutes = goal.targetNumberOfMinutesAWeek ?? 0;
  const weekMinutes = Math.floor(goal.weeklySeconds / 60);
  const overallWeeksDenom = getPeriodicCommittedWeekCount({
    trackableType: "MINUTES_A_WEEK",
    startDayYYYYMMDD: goal.startDayYYYYMMDD,
    endDayYYYYMMDD: goal.endDayYYYYMMDD,
    targetNumberOfWeeks: goal.targetNumberOfWeeks,
  });
  const minuteCredits =
    typeof goal.periodicOverallProgress === "number" &&
    Number.isFinite(goal.periodicOverallProgress)
      ? goal.periodicOverallProgress
      : 0;
  const overallWeeksNumerator =
    targetMinutes > 0 ? minuteCredits / targetMinutes : 0;

  return (
    <View style={{ gap: 12, width: "100%", alignSelf: "stretch", alignItems: "stretch" }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <WidgetTimerRow trackableId={goal._id} />
        {/* Time already spent today, ending now: one press. */}
        {QUICK_TIME_SECONDS.map((seconds) => (
          <QuickChip
            key={seconds}
            label={formatQuickDuration(seconds)}
            accessibilityLabel={`Log ${formatQuickDuration(seconds)} to ${goal.name}`}
            onPress={() => void quickLog.addTime(goal, seconds)}
          />
        ))}
      </View>
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
      {overallWeeksDenom > 0 && targetMinutes > 0 && (
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
