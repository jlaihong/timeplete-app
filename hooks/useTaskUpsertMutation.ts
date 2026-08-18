import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { applyTaskUpsertOptimisticUpdate } from "../lib/taskUpsertOptimisticUpdate";
import { runWithOutbox } from "../lib/runWithOutbox";

/** Shared `tasks.upsert` + optimistic cache patching + durable outbox. */
export function useTaskUpsertMutation() {
  const upsertRaw = useMutation(api.tasks.upsert).withOptimisticUpdate(
    applyTaskUpsertOptimisticUpdate,
  );

  return useCallback(
    (args: Parameters<typeof upsertRaw>[0]) =>
      runWithOutbox("tasks.upsert", args, (a) => upsertRaw(a)),
    [upsertRaw],
  );
}
