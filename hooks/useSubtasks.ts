import { useCallback, useMemo } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { useTimer } from "./useTimer";
import { todayYYYYMMDD } from "../lib/dates";
import { newClientMutationId } from "../lib/clientMutationId";
import { acknowledgeTaskCompleted } from "../lib/completionFeedback";
import { applyTimeSpentDeltaOptimisticUpdate } from "../lib/setTimeSpentOptimisticUpdate";
import {
  applyAddSubtaskOptimisticUpdate,
  applyMoveSubtaskOptimisticUpdate,
  applyRemoveSubtaskOptimisticUpdate,
  applyRenameSubtaskOptimisticUpdate,
  applySetSubtaskCompletedOptimisticUpdate,
  applySubtaskTimeAbsolute,
} from "../lib/subtaskOptimisticUpdates";

/**
 * A task's subtasks and everything that can be done to them. Pass `null`
 * to skip loading (collapsed row).
 */
export function useSubtasks(parentId: Id<"tasks"> | null) {
  const { profileReady } = useAuth();
  const timer = useTimer();
  const subtasks = useQuery(
    api.subtasks.list,
    profileReady && parentId ? { parentId } : "skip",
  );

  const addRaw = useMutation(api.subtasks.add).withOptimisticUpdate(
    applyAddSubtaskOptimisticUpdate,
  );
  const renameRaw = useMutation(api.subtasks.rename).withOptimisticUpdate(
    applyRenameSubtaskOptimisticUpdate,
  );
  const setCompletedRaw = useMutation(
    api.subtasks.setCompleted,
  ).withOptimisticUpdate(applySetSubtaskCompletedOptimisticUpdate);
  const moveRaw = useMutation(api.subtasks.move).withOptimisticUpdate(
    applyMoveSubtaskOptimisticUpdate,
  );
  const removeRaw = useMutation(api.subtasks.remove).withOptimisticUpdate(
    applyRemoveSubtaskOptimisticUpdate,
  );

  const baseSetTimeSpent = useMutation(api.tasks.setTimeSpent);
  const setTimeSpentRaw = useMemo(
    () =>
      baseSetTimeSpent.withOptimisticUpdate((localStore, args) => {
        const delta = applySubtaskTimeAbsolute(
          localStore,
          args.taskId,
          args.timeSpentInSecondsUnallocated,
        );
        // The parent's total moves by the same amount.
        if (parentId) {
          applyTimeSpentDeltaOptimisticUpdate(localStore, parentId, delta);
        }
      }),
    [baseSetTimeSpent, parentId],
  );

  const add = useCallback(
    (name: string) => {
      if (!parentId || !name.trim()) return;
      void addRaw({
        parentId,
        name: name.trim(),
        clientMutationId: newClientMutationId(),
      });
    },
    [addRaw, parentId],
  );

  const rename = useCallback(
    (id: Id<"tasks">, name: string) => {
      if (!name.trim()) return;
      void renameRaw({ id, name: name.trim() });
    },
    [renameRaw],
  );

  const timerSubtaskId = timer.subtaskId;
  const stopTimer = timer.stop;
  const startForTask = timer.startForTask;

  const toggleCompleted = useCallback(
    (id: Id<"tasks">, completed: boolean) => {
      if (completed) {
        acknowledgeTaskCompleted();
        if (timerSubtaskId === id) void stopTimer();
      }
      void setCompletedRaw({ id, completed, day: todayYYYYMMDD() });
    },
    [setCompletedRaw, timerSubtaskId, stopTimer],
  );

  const move = useCallback(
    (id: Id<"tasks">, toIndex: number) => {
      void moveRaw({ id, toIndex });
    },
    [moveRaw],
  );

  const remove = useCallback(
    (id: Id<"tasks">) => {
      void removeRaw({ id });
    },
    [removeRaw],
  );

  /** Start timing the subtask, or stop if it is the one being timed. */
  const toggleTimer = useCallback(
    (id: Id<"tasks">) => {
      if (!parentId) return;
      if (timerSubtaskId === id) {
        void stopTimer();
        return;
      }
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      void startForTask(parentId, tz, id);
    },
    [parentId, timerSubtaskId, stopTimer, startForTask],
  );

  const setTimeSpent = useCallback(
    async (id: Id<"tasks">, seconds: number) => {
      await setTimeSpentRaw({
        taskId: id,
        timeSpentInSecondsUnallocated: Math.max(0, Math.floor(seconds)),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    [setTimeSpentRaw],
  );

  return {
    subtasks,
    timerSubtaskId,
    timerStartTime: timer.startTime,
    add,
    rename,
    toggleCompleted,
    move,
    remove,
    toggleTimer,
    setTimeSpent,
  };
}
