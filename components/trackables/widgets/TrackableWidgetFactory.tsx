import React from "react";
import { TrackableWidgetCard } from "./TrackableWidgetCard";
import { DaysAWeekWidget } from "./DaysAWeekWidget";
import { MinutesAWeekWidget } from "./MinutesAWeekWidget";
import { TimeTrackWidget } from "./TimeTrackWidget";
import { NumberWidget } from "./NumberWidget";
import { TrackerWidget } from "./TrackerWidget";
import { computeGoalCompletion } from "./widgetMath";
import type { LogRequest, WidgetGoal } from "./types";

interface TrackableWidgetFactoryProps {
  goal: WidgetGoal;
  /** YYYYMMDD (no dashes) — passed down for stats / quick-log dialogs. */
  today: string;
  /** Called when a widget wants to open a quick-log dialog. */
  onRequestLog: (req: LogRequest) => void;
  onRequestEditTrackable?: (trackableId: string) => void;
}

/**
 * Mirror of productivity-one's `@switch (trackableType)` in
 * `goal-widget.html`: pick the right body component for the goal's type.
 *
 * Mapping (productivity-one → ours):
 *   PERIODIC + COUPLE_DAYS_A_WEEK / READING → DAYS_A_WEEK → DaysAWeekWidget
 *   PERIODIC + COUPLE_MINUTES_A_WEEK        → MINUTES_A_WEEK → MinutesAWeekWidget
 *   TIME_TRACK                              → TIME_TRACK   → TimeTrackWidget
 *   COUNT                                   → NUMBER       → NumberWidget
 *   TRACKER                                 → TRACKER      → TrackerWidget
 */
export function TrackableWidgetFactory({
  goal,
  today,
  onRequestLog,
  onRequestEditTrackable,
}: TrackableWidgetFactoryProps) {
  const completed = computeGoalCompletion(goal);
  return (
    <TrackableWidgetCard
      goal={goal}
      completed={completed}
      onRequestEditTrackable={onRequestEditTrackable}
    >
      {renderBody(goal, today, onRequestLog, completed)}
    </TrackableWidgetCard>
  );
}

function renderBody(
  goal: WidgetGoal,
  today: string,
  onRequestLog: (req: LogRequest) => void,
  completed: boolean
) {
  switch (goal.trackableType) {
    case "DAYS_A_WEEK":
      return (
        <DaysAWeekWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
          completed={completed}
        />
      );
    case "MINUTES_A_WEEK":
      return (
        <MinutesAWeekWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
          completed={completed}
        />
      );
    case "TIME_TRACK":
      return (
        <TimeTrackWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
          completed={completed}
        />
      );
    case "NUMBER":
      return (
        <NumberWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
          completed={completed}
        />
      );
    case "TRACKER":
      return (
        <TrackerWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
          completed={completed}
        />
      );
    default:
      return null;
  }
}
