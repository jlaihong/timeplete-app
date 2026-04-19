import React from "react";
import { TrackPeriodicDialog } from "./dialogs/TrackPeriodicDialog";
import { TrackTimeDialog } from "./dialogs/TrackTimeDialog";
import { TrackCountDialog } from "./dialogs/TrackCountDialog";
import { TrackTrackerDialog } from "./dialogs/TrackTrackerDialog";
import type { LogRequest } from "./types";

interface TrackableDialogHostProps {
  request: LogRequest | null;
  onClose: () => void;
}

/**
 * Renders the active per-trackable quick-log dialog. Mounted at the **root**
 * of the screen (e.g. `DesktopHome`) so the overlay covers the full viewport
 * and isn't clipped by the narrow trackables column. Widgets bubble a
 * `LogRequest` up through `TrackableList`'s `onRequestLog` callback rather
 * than rendering dialogs locally inside the virtualized `FlatList`.
 */
export function TrackableDialogHost({
  request,
  onClose,
}: TrackableDialogHostProps) {
  if (!request) return null;

  switch (request.kind) {
    case "periodic":
      return (
        <TrackPeriodicDialog
          trackableId={request.goal._id}
          trackableName={request.goal.name}
          trackableColour={request.goal.colour}
          dayYYYYMMDD={request.dayYYYYMMDD}
          initialNumCompleted={request.initialNumCompleted}
          initialComments={request.initialComments}
          onClose={onClose}
        />
      );
    case "time":
      return (
        <TrackTimeDialog
          trackableId={request.goal._id}
          trackableName={request.goal.name}
          trackableColour={request.goal.colour}
          dayYYYYMMDD={request.dayYYYYMMDD}
          onClose={onClose}
        />
      );
    case "count":
      return (
        <TrackCountDialog
          trackableId={request.goal._id}
          trackableName={request.goal.name}
          trackableColour={request.goal.colour}
          dayYYYYMMDD={request.dayYYYYMMDD}
          initialCount={request.initialCount}
          initialComments={request.initialComments}
          onClose={onClose}
        />
      );
    case "tracker":
      return (
        <TrackTrackerDialog
          trackableId={request.goal._id}
          trackableName={request.goal.name}
          trackableColour={request.goal.colour}
          dayYYYYMMDD={request.dayYYYYMMDD}
          trackCount={request.goal.trackCount ?? false}
          trackTime={request.goal.trackTime ?? false}
          isRatingTracker={request.goal.isRatingTracker ?? false}
          onClose={onClose}
        />
      );
  }
}
