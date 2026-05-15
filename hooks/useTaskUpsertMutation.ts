import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { applyTaskUpsertOptimisticUpdate } from "../lib/taskUpsertOptimisticUpdate";

/** Shared `tasks.upsert` + optimistic cache patching (Home, AddTaskSheet, list detail, …). */
export function useTaskUpsertMutation() {
  return useMutation(api.tasks.upsert).withOptimisticUpdate(
    applyTaskUpsertOptimisticUpdate,
  );
}
