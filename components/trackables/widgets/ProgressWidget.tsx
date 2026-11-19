import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { FontSize } from "../../../theme/tokens";
import { useAuth } from "../../../hooks/useAuth";
import {
  PERIODS,
  formatMeasure,
  goalTarget,
} from "../../../lib/trackableShape";
import { ProgressBarWithText } from "./atoms/ProgressBarWithText";
import { DayOfWeekCompletion } from "./atoms/DayOfWeekCompletion";
import { WidgetTimerRow } from "./atoms/WidgetTimerRow";
import { GoalStatItem } from "./atoms/GoalStatItem";
import {
  QUICK_TIME_SECONDS,
  QuickChip,
  formatQuickDuration,
  useQuickLog,
} from "./quickLog";
import type { WidgetBodyProps } from "./types";

/**
 * The body of every trackable card. One layout for every trackable:
 *
 *   a quick action that fits the measure (start a timer or add time,
 *   "+1", tick a day, log a value);
 *   the current period's value against the goal, or, with no goal, this
 *   week and today.
 *
 * The numbers come from `api.trackableProgress.get`, which computes any
 * measure and goal the same way.
 */
export function ProgressWidget({ goal, today, onRequestLog }: WidgetBodyProps) {
  const { profileReady } = useAuth();
  const quickLog = useQuickLog();
  const progress = useQuery(
    api.trackableProgress.get,
    profileReady ? { id: goal._id, today } : "skip",
  );
  if (!progress) return <View style={styles.placeholder} />;

  const { measure } = progress;
  const fmt = (n: number) => formatMeasure(measure, n);
  const todayEntry = progress.week.find((d) => d.dayYYYYMMDD === today);
  const periodNoun = PERIODS.find((p) => p.key === progress.period.kind)!.noun;

  // A weekly goal kept for a number of weeks ("6 days a week, for 45
  // weeks") also shows how many weeks have met it so far.
  // `getGoalDetails` reports that as weeks met × the weekly target.
  const weeklyTarget =
    goal.trackableType === "DAYS_A_WEEK"
      ? (goal.targetNumberOfDaysAWeek ?? 0)
      : goal.trackableType === "MINUTES_A_WEEK"
        ? (goal.targetNumberOfMinutesAWeek ?? 0)
        : 0;
  const weeksTarget = goal.targetNumberOfWeeks ?? 0;
  const overallWeeks =
    progress.goal?.period === "week" &&
    progress.goal.direction === "atLeast" &&
    weeklyTarget > 0 &&
    weeksTarget > 0
      ? {
          met: Math.round((goal.periodicOverallProgress ?? 0) / weeklyTarget),
          target: weeksTarget,
        }
      : null;

  return (
    <View style={styles.body}>
      <View style={styles.actionsRow}>
        {measure === "time" ? (
          <>
            <WidgetTimerRow trackableId={goal._id} />
            {QUICK_TIME_SECONDS.map((seconds) => (
              <QuickChip
                key={seconds}
                label={formatQuickDuration(seconds)}
                accessibilityLabel={`Log ${formatQuickDuration(seconds)} to ${goal.name}`}
                onPress={() => void quickLog.addTime(goal, seconds)}
              />
            ))}
          </>
        ) : null}
        {measure === "count" && todayEntry ? (
          <QuickChip
            wide
            label="+1"
            accessibilityLabel={`Add one to ${goal.name}`}
            onPress={() =>
              void quickLog.setCheckIns(goal, todayEntry, todayEntry.checkIns + 1)
            }
          />
        ) : null}
        {measure === "number" ? (
          <QuickChip
            wide
            label="Log a value"
            accessibilityLabel={`Log a value for ${goal.name}`}
            onPress={() =>
              onRequestLog({ trackableId: goal._id, dayYYYYMMDD: today })
            }
          />
        ) : null}
      </View>

      {measure === "days" ? (
        <DayOfWeekCompletion
          days={progress.week.map((d) => ({
            dayYYYYMMDD: d.dayYYYYMMDD,
            numCompleted: d.value,
          }))}
          colour={goal.colour}
          // One press ticks the day (or clears a tick). A day that is
          // active because of an event or a task stays active.
          onDayPress={(day) => {
            const entry = progress.week.find((d) => d.dayYYYYMMDD === day);
            if (!entry) return;
            void quickLog.setCheckIns(goal, entry, entry.checkIns > 0 ? 0 : 1);
          }}
        />
      ) : null}

      {progress.goal && progress.target !== null ? (
        <>
          <ProgressBarWithText
            caption={
              progress.goal.direction === "atMost"
                ? `${periodNoun} · limit`
                : periodNoun
            }
            numerator={progress.value}
            denominator={goalTarget(measure, progress.goal) || 1}
            colour={progress.status === "over" ? Colors.error : goal.colour}
            format={fmt}
          />
          {progress.status === "met" ? (
            <Text style={styles.met}>Goal met</Text>
          ) : progress.status === "over" ? (
            <Text style={styles.over}>
              Over by {fmt(progress.value - progress.target)}
            </Text>
          ) : null}
          {overallWeeks ? (
            <ProgressBarWithText
              caption="Overall · weeks met"
              numerator={overallWeeks.met}
              denominator={overallWeeks.target}
              colour={goal.colour}
            />
          ) : null}
        </>
      ) : (
        <View style={styles.statsRow}>
          <GoalStatItem label="this week" value={fmt(progress.value)} />
          {progress.todayValue > 0 ? (
            <GoalStatItem label="today" value={`+${fmt(progress.todayValue)}`} />
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: 12, width: "100%", alignSelf: "stretch", alignItems: "stretch" },
  placeholder: { height: 64 },
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
  met: { fontSize: FontSize.caption, color: Colors.success },
  over: { fontSize: FontSize.caption, color: Colors.error },
});
