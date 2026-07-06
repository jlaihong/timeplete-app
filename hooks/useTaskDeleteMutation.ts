import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { applyTaskRemoveOptimisticUpdate } from "../lib/taskRemoveOptimisticUpdate";

export interface DeleteTaskInput {
  taskId: Id<"tasks">;
  /**
   * Task title, used verbatim in the confirmation dialog. Falls back to
   * a generic "this task" when omitted (kept optional so tools that
   * don't have the task's name — e.g. drag-drop clean-up — still work).
   */
  taskName?: string;
  /** True when the task row represents a materialised recurring instance. */
  isRecurringInstance?: boolean;
  /**
   * The parent recurring-rule id (from the `recurringTasks` table),
   * present on any recurring-instance row.
   */
  recurringTaskId?: Id<"recurringTasks"> | null | undefined;
  /**
   * Fires after a successful delete. Skipped when the user cancels the
   * confirmation. Typical use: closing the containing sheet / popover.
   */
  onDeleted?: () => void;
}

/**
 * Shared task-delete hook with confirmation — the single source of
 * truth for task removal across desktop context menu, mobile swipe-to-
 * delete, mobile `TaskDetailSheet`, and list-detail.
 *
 * Confirmation UI matches the established pattern used by
 * `ListDialog.handleDelete` / `EditTrackableDialog.confirmDelete`:
 *   - Web       → native `window.confirm`
 *   - Native    → `Alert.alert(..., destructive-styled "Delete")`
 *
 * Once confirmed, recurring-instance rows go through
 * `recurringTasks.deleteInstance` (skip-set aware — adds `taskDay` to
 * `deletedRecurringOccurrences` before removal so `generateInstances`
 * doesn't recreate the instance we just deleted). Non-recurring rows
 * use the standard cascade `tasks.remove`. Both apply
 * `applyTaskRemoveOptimisticUpdate` so the row disappears from every
 * cached home / list query synchronously.
 */
export function useTaskDeleteMutation() {
  const removeTask = useMutation(api.tasks.remove).withOptimisticUpdate(
    (localStore, args) => {
      applyTaskRemoveOptimisticUpdate(localStore, args.id);
    },
  );
  const deleteRecurringInstance = useMutation(
    api.recurringTasks.deleteInstance,
  ).withOptimisticUpdate((localStore, args) => {
    applyTaskRemoveOptimisticUpdate(localStore, args.taskId, {
      cascadeRootChildren: false,
    });
  });

  return useCallback(
    ({
      taskId,
      taskName,
      isRecurringInstance,
      recurringTaskId,
      onDeleted,
    }: DeleteTaskInput): void => {
      const doDelete = async () => {
        try {
          if (isRecurringInstance && recurringTaskId) {
            await deleteRecurringInstance({ taskId });
          } else {
            await removeTask({ id: taskId });
          }
          onDeleted?.();
        } catch (err) {
          console.error("[useTaskDeleteMutation] delete failed:", err);
        }
      };

      // Recurring instances only remove the tapped occurrence — spell
      // that out so users don't fear they're wiping the whole series
      // (parity with `EditTrackableDialog`'s explicit-scope copy).
      const namePart = taskName ? `"${taskName}"` : "this task";
      const message = isRecurringInstance
        ? `Delete this occurrence of ${namePart}?`
        : `Delete ${namePart}?`;

      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        if (window.confirm(message)) void doDelete();
        return;
      }
      Alert.alert("Delete task", message, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => void doDelete(),
        },
      ]);
    },
    [removeTask, deleteRecurringInstance],
  );
}
