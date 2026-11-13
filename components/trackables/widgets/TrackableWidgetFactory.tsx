import React from "react";
import { TrackableWidgetCard } from "./TrackableWidgetCard";
import { DaysAWeekWidget } from "./DaysAWeekWidget";
import { MinutesAWeekWidget } from "./MinutesAWeekWidget";
import { TimeTrackWidget } from "./TimeTrackWidget";
import { NumberWidget } from "./NumberWidget";
import { TrackerWidget } from "./TrackerWidget";
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
  return (
    <TrackableWidgetCard
      goal={goal}
      onRequestEditTrackable={onRequestEditTrackable}
      onRequestLogDetails={() => onRequestLog(detailsRequest(goal, today))}
    >
      {renderBody(goal, today, onRequestLog)}
    </TrackableWidgetCard>
  );
}

/**
 * The full log dialog for today — the card's "⋯" button. The card itself
 * logs the usual amount in one press; this is for another day, a custom
 * amount, or a note.
 */
function detailsRequest(goal: WidgetGoal, today: string): LogRequest {
  const todayEntry = goal.weeklyDayCompletion.find(
    (d) => d.dayYYYYMMDD === today,
  );
  switch (goal.trackableType) {
    case "DAYS_A_WEEK":
      return {
        kind: "periodic",
        goal,
        dayYYYYMMDD: today,
        initialNumCompleted: todayEntry?.numCompleted ?? 0,
        initialComments: todayEntry?.comments ?? "",
      };
    case "NUMBER":
      return {
        kind: "count",
        goal,
        dayYYYYMMDD: today,
        initialCount: todayEntry?.numCompleted ?? 0,
        initialComments: todayEntry?.comments ?? "",
      };
    case "TRACKER":
      return { kind: "tracker", goal, dayYYYYMMDD: today };
    default:
      return { kind: "time", goal, dayYYYYMMDD: today };
  }
}

function renderBody(
  goal: WidgetGoal,
  today: string,
  onRequestLog: (req: LogRequest) => void
) {
  switch (goal.trackableType) {
    case "DAYS_A_WEEK":
      return (
        <DaysAWeekWidget goal={goal} today={today} onRequestLog={onRequestLog} />
      );
    case "MINUTES_A_WEEK":
      return (
        <MinutesAWeekWidget
          goal={goal}
          today={today}
          onRequestLog={onRequestLog}
        />
      );
    case "TIME_TRACK":
      return (
        <TimeTrackWidget goal={goal} today={today} onRequestLog={onRequestLog} />
      );
    case "NUMBER":
      return (
        <NumberWidget goal={goal} today={today} onRequestLog={onRequestLog} />
      );
    case "TRACKER":
      return (
        <TrackerWidget goal={goal} today={today} onRequestLog={onRequestLog} />
      );
    default:
      return null;
  }
}
