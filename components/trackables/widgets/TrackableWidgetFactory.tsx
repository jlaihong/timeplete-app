import React, { useState } from "react";
import { View } from "react-native";
import { SubTrackablePills } from "./SubTrackablePills";
import { useTrackableTags } from "../../../hooks/useTrackableTags";
import { TrackableWidgetCard } from "./TrackableWidgetCard";
import { ProgressWidget } from "./ProgressWidget";
import type { LogRequest, WidgetGoal } from "./types";

export interface SubGoal {
  item: WidgetGoal;
  /** 0 for a direct sub-trackable of the card's trackable. */
  depth: number;
}

interface TrackableWidgetFactoryProps {
  goal: WidgetGoal;
  /** YYYYMMDD (no dashes) — passed down for stats / quick-log dialogs. */
  today: string;
  /** Called when a widget wants to open a quick-log dialog. */
  onRequestLog: (req: LogRequest) => void;
  onRequestEditTrackable?: (trackableId: string) => void;
  /**
   * Trackables below this one that the card can move to. They do not get
   * cards of their own.
   */
  subGoals?: SubGoal[];
}

/**
 * A trackable's card: shared chrome around the one body every trackable
 * uses (`ProgressWidget`). The log dialog behind the "⋯" button is still
 * picked by the trackable's old type.
 */
export function TrackableWidgetFactory({
  goal,
  today,
  onRequestLog,
  onRequestEditTrackable,
  subGoals,
}: TrackableWidgetFactoryProps) {
  const tags = useTrackableTags();
  // The card shows one trackable at a time: its own, or, after a pill is
  // pressed, one of the trackables below it.
  const [focusId, setFocusId] = useState<string | null>(null);
  const inCard = (id: string | null | undefined) =>
    id ? subGoals?.find((s) => s.item._id === id)?.item : undefined;
  const focused = inCard(focusId) ?? goal;
  const goUp = () => {
    const parentId = tags.byId.get(focused._id)?.parentId;
    setFocusId(inCard(parentId) ? (parentId as string) : null);
  };

  return (
    <TrackableWidgetCard
      goal={focused}
      onBack={focused._id !== goal._id ? goUp : undefined}
      onRequestEditTrackable={onRequestEditTrackable}
      onRequestLogDetails={() => onRequestLog(detailsRequest(focused, today))}
    >
      <View style={{ gap: 12, alignSelf: "stretch" }}>
        <ProgressWidget
          key={focused._id}
          goal={focused}
          today={today}
          onRequestLog={onRequestLog}
        />
        <SubTrackablePills
          trackableId={focused._id}
          today={today}
          onPick={(id) => {
            // A sub-trackable that is not in this list (hidden from Home,
            // say) opens its page instead.
            if (inCard(id)) setFocusId(id);
            else onRequestEditTrackable?.(id);
          }}
        />
      </View>
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

