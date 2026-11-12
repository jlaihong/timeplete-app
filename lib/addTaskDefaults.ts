/**
 * Shared rules for the "Add task" dialogs.
 *
 * A task always lives in exactly one list (Inbox when none is chosen).
 * Which trackable it counts toward is a separate question: by default it
 * follows the list's linked trackable, and `trackableId` on the task is
 * only an explicit per-task override.
 */
import type { Id } from "../convex/_generated/dataModel";

export type AddTaskAssignmentDefaultsInput = {
  contextualListId: Id<"lists"> | undefined;
  /**
   * Trackable to pre-select as an explicit override — used when the dialog
   * is opened from a trackable ("add a task to this trackable").
   */
  defaultTrackableId?: Id<"trackables"> | null;
  /** Trackable the contextual list is already linked to, if any. */
  contextualListTrackableId?: Id<"trackables"> | null;
};

/** Initial `(listId, trackableId)` picker state. */
export function initialAssignmentStateFromAddTaskContext(
  parts: AddTaskAssignmentDefaultsInput,
): {
  listId: Id<"lists"> | null;
  trackableId: Id<"trackables"> | null;
} {
  return {
    listId: parts.contextualListId ?? null,
    trackableId: normalizeTrackableOverride(
      parts.defaultTrackableId ?? null,
      parts.contextualListTrackableId ?? null,
    ),
  };
}

/**
 * An override equal to what the list already provides is not an override:
 * store nothing so the task keeps following its list if the link changes.
 */
export function normalizeTrackableOverride(
  trackableId: Id<"trackables"> | null,
  inheritedTrackableId: Id<"trackables"> | null,
): Id<"trackables"> | null {
  if (!trackableId) return null;
  return trackableId === inheritedTrackableId ? null : trackableId;
}

/**
 * List a new task is created in. The list the dialog was opened from wins
 * when it is pinned (`lockListToContext`); otherwise the picked list, and
 * Inbox when nothing was picked. Never empty once the inbox is known.
 */
export function resolveEffectiveListIdForTaskCreate(opts: {
  lockListToContext: boolean;
  contextualListId: Id<"lists"> | undefined;
  explicitListId: Id<"lists"> | null;
  inboxListId: Id<"lists"> | null | undefined;
}): Id<"lists"> | undefined {
  if (opts.lockListToContext && opts.contextualListId) {
    return opts.contextualListId;
  }
  return opts.explicitListId ?? opts.inboxListId ?? undefined;
}
