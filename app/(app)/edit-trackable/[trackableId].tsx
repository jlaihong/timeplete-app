import React from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Id } from "../../../convex/_generated/dataModel";
import { EditTrackableDialog } from "../../../components/trackables/EditTrackableDialog";

export default function EditTrackableScreen() {
  const { trackableId } = useLocalSearchParams<{ trackableId: string }>();
  if (!trackableId) return null;
  return (
    <EditTrackableDialog
      trackableId={trackableId as Id<"trackables">}
      onClose={() => router.back()}
    />
  );
}
