import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Id } from "../../../convex/_generated/dataModel";
import { EditTrackableDialog } from "../../../components/trackables/EditTrackableDialog";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

/**
 * A trackable. Desktop shows it as a full page (progress, tasks and history
 * side by side, with settings behind an Edit button); phones show the
 * tabbed dialog.
 */
export default function EditTrackableScreen() {
  const { trackableId, from } = useLocalSearchParams<{
    trackableId: string;
    from?: string;
  }>();
  const isDesktop = useIsDesktop();
  if (!trackableId) return null;

  if (isDesktop) {
    return (
      <EditTrackableDialog
        trackableId={trackableId as Id<"trackables">}
        presentation="page"
        // Navigate to a named place rather than `router.back()`: with the
        // permanent desktop drawer, back does not reliably pop this screen.
        onClose={() =>
          router.navigate(
            from === "home" ? "/(app)/(tabs)" : "/(app)/(tabs)/goals",
          )
        }
      />
    );
  }

  return (
    <EditTrackableDialog
      trackableId={trackableId as Id<"trackables">}
      onClose={() => router.back()}
    />
  );
}
