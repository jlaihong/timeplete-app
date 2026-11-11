import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { applyArchiveListOptimisticUpdate } from "../lib/archiveListOptimisticUpdate";

export interface ArchiveListInput {
  _id: Id<"lists">;
  name: string;
  archived: boolean;
  onArchived?: () => void;
}

/**
 * Confirm, then toggle `lists.archive`. Archiving hides the list from the
 * sidebar and the active lists. The tasks stay on the list.
 */
export function useArchiveList() {
  const archiveList = useMutation(api.lists.archive).withOptimisticUpdate(
    applyArchiveListOptimisticUpdate,
  );

  return useCallback(
    (list: ArchiveListInput) => {
      const restoring = list.archived;
      const title = restoring
        ? `Unarchive list "${list.name}"?`
        : `Archive list "${list.name}"?`;
      const message = restoring
        ? "This puts the list back with your active lists and in the sidebar."
        : "This hides the list from your active lists and the sidebar. Tasks and history stay on the list.";

      const run = async () => {
        try {
          await archiveList({ id: list._id });
          list.onArchived?.();
        } catch (err) {
          console.error("[useArchiveList] archive failed:", err);
        }
      };

      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(`${title}\n\n${message}`)) void run();
        return;
      }
      Alert.alert(title, message, [
        { text: "Cancel", style: "cancel" },
        { text: restoring ? "Unarchive" : "Archive", onPress: () => void run() },
      ]);
    },
    [archiveList],
  );
}
