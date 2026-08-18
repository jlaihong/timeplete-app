import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import {
  applyMoveBetweenDaysOptimisticUpdate,
  applyMoveBetweenSectionsOptimisticUpdate,
  applyMoveOnDayOptimisticUpdate,
} from "../lib/taskMoveOptimisticUpdate";
import { runWithOutbox } from "../lib/runWithOutbox";

/** Shared task reorder mutations with optimistic cache + durable outbox. */
export function useTaskMoveMutations() {
  const moveOnDayRaw = useMutation(api.tasks.moveOnDay).withOptimisticUpdate(
    (localStore, args) => {
      applyMoveOnDayOptimisticUpdate(localStore, args);
    },
  );
  const moveBetweenDaysRaw = useMutation(
    api.tasks.moveBetweenDays,
  ).withOptimisticUpdate((localStore, args) => {
    applyMoveBetweenDaysOptimisticUpdate(localStore, args);
  });
  const moveBetweenSectionsRaw = useMutation(
    api.tasks.moveBetweenSections,
  ).withOptimisticUpdate((localStore, args) => {
    applyMoveBetweenSectionsOptimisticUpdate(localStore, args);
  });

  const moveOnDay = useCallback(
    (args: {
      taskId: Id<"tasks">;
      day: string;
      newOrderIndex: number;
      clientMutationId?: string;
    }) => runWithOutbox("tasks.moveOnDay", args, (a) => moveOnDayRaw(a)),
    [moveOnDayRaw],
  );

  const moveBetweenDays = useCallback(
    (args: {
      taskId: Id<"tasks">;
      fromDay: string;
      toDay: string;
      newOrderIndex: number;
      clientMutationId?: string;
    }) =>
      runWithOutbox("tasks.moveBetweenDays", args, (a) =>
        moveBetweenDaysRaw(a),
      ),
    [moveBetweenDaysRaw],
  );

  const moveBetweenSections = useCallback(
    (args: {
      taskId: Id<"tasks">;
      toSectionId: Id<"listSections">;
      newOrderIndex: number;
      clientMutationId?: string;
    }) =>
      runWithOutbox("tasks.moveBetweenSections", args, (a) =>
        moveBetweenSectionsRaw(a),
      ),
    [moveBetweenSectionsRaw],
  );

  return { moveOnDay, moveBetweenDays, moveBetweenSections };
}
