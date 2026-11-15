import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useAuth } from "../../../../hooks/useAuth";
import { TrackCountDialog } from "./TrackCountDialog";
import { TrackPeriodicDialog } from "./TrackPeriodicDialog";
import { TrackTimeDialog } from "./TrackTimeDialog";
import { TrackTrackerDialog } from "./TrackTrackerDialog";

interface TrackableLogDialogProps {
  trackableId: Id<"trackables">;
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
  onClose: () => void;
}

/**
 * The full log dialog for a trackable on a day (another day, a custom
 * amount, a note), chosen by what the trackable measures:
 *
 *   time     start time and duration → an event allocated to it
 *   count    how many times that day
 *   days     done that day, or not
 *   number   a value (or a 1–10 rating when values are averaged)
 */
export function TrackableLogDialog({
  trackableId,
  dayYYYYMMDD,
  onClose,
}: TrackableLogDialogProps) {
  const { profileReady } = useAuth();
  const day = useQuery(
    api.trackableProgress.day,
    profileReady ? { id: trackableId, day: dayYYYYMMDD } : "skip",
  );
  if (!day) return null;

  const common = {
    trackableId,
    trackableName: day.name,
    trackableColour: day.colour,
    dayYYYYMMDD,
    onClose,
  };
  switch (day.measure) {
    case "time":
      return <TrackTimeDialog {...common} />;
    case "count":
      return (
        <TrackCountDialog
          {...common}
          // The stepper shows the day's total; tasks that counted are part
          // of it and are taken back out when saving.
          initialCount={day.checkIns + day.taskCount}
          initialComments={day.comments}
        />
      );
    case "days":
      return (
        <TrackPeriodicDialog
          {...common}
          initialNumCompleted={day.checkIns + day.taskCount}
          initialComments={day.comments}
        />
      );
    case "number":
      return (
        <TrackTrackerDialog
          {...common}
          trackCount
          trackTime={false}
          isRatingTracker={!day.cumulative}
        />
      );
  }
}
