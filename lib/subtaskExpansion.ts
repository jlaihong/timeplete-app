/**
 * Which tasks have their subtasks shown inline, shared by every task row
 * so a task stays open when its row re-mounts (drag, regrouping, moving
 * between Home and a list). Kept in memory for the session only.
 */
import { useSyncExternalStore } from "react";

const expanded = new Set<string>();
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setSubtasksExpanded(taskId: string, open: boolean): void {
  if (expanded.has(taskId) === open) return;
  if (open) expanded.add(taskId);
  else expanded.delete(taskId);
  emit();
}

export function toggleSubtasksExpanded(taskId: string): void {
  setSubtasksExpanded(taskId, !expanded.has(taskId));
}

export function useSubtasksExpanded(taskId: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => expanded.has(taskId),
    () => false,
  );
}

/** Tasks opened in order to add a subtask: the add field takes focus once. */
const pendingAddFocus = new Set<string>();

/** Open a task's subtasks with the "Add subtask" field focused. */
export function openSubtasksToAdd(taskId: string): void {
  pendingAddFocus.add(taskId);
  setSubtasksExpanded(taskId, true);
}

/** True once after `openSubtasksToAdd(taskId)`. */
export function consumeSubtaskAddFocus(taskId: string): boolean {
  return pendingAddFocus.delete(taskId);
}
