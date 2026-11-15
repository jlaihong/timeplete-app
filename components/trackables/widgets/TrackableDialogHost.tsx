import React from "react";
import { TrackableLogDialog } from "./dialogs/TrackableLogDialog";
import type { LogRequest } from "./types";
import { QuickLogToastHost } from "./quickLog";

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
  return (
    <>
      {request ? (
        <TrackableLogDialog
          trackableId={request.trackableId}
          dayYYYYMMDD={request.dayYYYYMMDD}
          onClose={onClose}
        />
      ) : null}
      {/* The "Logged · Undo" message for one-click logs from the cards. */}
      <QuickLogToastHost />
    </>
  );
}

