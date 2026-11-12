import { useCallback, useRef } from "react";
import { Alert, Platform } from "react-native";

/** Ask before throwing away edits; runs `onDiscard` only on a yes. */
export function confirmDiscardChanges(onDiscard: () => void): void {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (window.confirm("Discard your unsaved changes?")) onDiscard();
    return;
  }
  Alert.alert("Discard changes?", "Your edits have not been saved.", [
    { text: "Keep editing", style: "cancel" },
    { text: "Discard", style: "destructive", onPress: onDiscard },
  ]);
}

/**
 * Close handler for the ways a dialog can be dismissed by accident: a click
 * on the backdrop, Escape, or the header ✕. Closes straight away when
 * nothing has changed and asks first when something has.
 *
 * Not for the Cancel button (an explicit "discard") or for closing after a
 * successful save — call `onClose` directly there.
 */
export function useDiscardGuard(
  isDirty: boolean,
  onClose: () => void,
): () => void {
  // Read through a ref so the returned function is stable and always sees
  // the latest value, even from a handler captured earlier in the render.
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  return useCallback(() => {
    if (dirtyRef.current) confirmDiscardChanges(() => closeRef.current());
    else closeRef.current();
  }, []);
}
