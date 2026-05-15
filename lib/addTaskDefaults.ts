/**
 * Shared rules for desktop/mobile “Add task” dialogs — aligns with productivity-one’s
 * list / goal mutual exclusion + contextual list pinning on the list-detail page.
 */
import type { Id } from "../convex/_generated/dataModel";

export type AddTaskAssignmentDefaultsInput = {
  contextualListId: Id<"lists"> | undefined;
  /** Optional default trackable from a list↔goal link (`lists.search.trackableId`). */
  defaultTrackableId?: Id<"trackables"> | null;
};

/**
 * Initial `(listId, trackableId)` picker state — goal selection clears explicit list choice
 * so the UX matches productivity-one mutual exclusion on open.
 */
export function initialAssignmentStateFromAddTaskContext(
  parts: AddTaskAssignmentDefaultsInput,
): {
  listId: Id<"lists"> | null;
  trackableId: Id<"trackables"> | null;
} {
  const t = parts.defaultTrackableId ?? null;
  return {
    trackableId: t,
    listId: t ? null : (parts.contextualListId ?? null),
  };
}

/**
 * Mirrors productivity-one save order extended for Convex:
 * contextual list pinning (`lockListToContext`) wins so `tasks.upsert` always receives the
 * list the dialog was opened from when appropriate — including optimistic `lists.getPaginated`
 * stubs when a linked goal stays selected.
 */
export function resolveEffectiveListIdForTaskCreate(opts: {
  trackableId: Id<"trackables"> | null;
  lockListToContext: boolean;
  contextualListId: Id<"lists"> | undefined;
  /** Current list-picker value (mutually exclusive with a selected trackable in state). */
  explicitListId: Id<"lists"> | null;
  inboxListId: Id<"lists"> | null | undefined;
}): Id<"lists"> | undefined {
  if (opts.lockListToContext && opts.contextualListId) {
    return opts.contextualListId;
  }
  if (opts.trackableId) {
    return undefined;
  }
  return opts.explicitListId ?? opts.inboxListId ?? undefined;
}
