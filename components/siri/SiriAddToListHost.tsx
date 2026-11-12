import React from "react";
import { AutoDismissToast } from "../ui/AutoDismissToast";
import { useSiriAddToList } from "../../hooks/useSiriAddToList";

/** Listens for Siri / `timeplete://add-to-list` and shows a confirmation toast. */
export function SiriAddToListHost() {
  const { toast, dismissToast } = useSiriAddToList();
  return <AutoDismissToast message={toast} onDismiss={dismissToast} />;
}
