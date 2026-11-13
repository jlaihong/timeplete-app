import { useCallback, useEffect, useRef, useState } from "react";
import { acknowledgeTaskCompleted } from "../lib/completionFeedback";

/** How long a row shows its tick in place before the completion is saved. */
const ACKNOWLEDGE_MS = 200;
/** Keep the ticked look until the saved state has reached the row. */
const HANDOVER_MS = 150;

/**
 * Completing a task with a visible, audible acknowledgement.
 *
 * Saving a completion usually moves the row straight away (to the bottom
 * of the day, or out of a list that hides completed tasks), so there is
 * nothing to see. `complete(id, save)` instead plays the feedback, marks
 * the id in `completingIds` so the row can show its tick and strike-through
 * where it stands, and runs `save` a moment later.
 *
 * Leaving the screen early still saves: pending completions run on unmount.
 */
export function useCompleteWithFeedback() {
  const [completingIds, setCompletingIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const pending = useRef(
    new Map<string, { timer: ReturnType<typeof setTimeout>; save: () => void }>(),
  );

  useEffect(() => {
    const map = pending.current;
    return () => {
      map.forEach(({ timer, save }) => {
        clearTimeout(timer);
        save();
      });
      map.clear();
    };
  }, []);

  const complete = useCallback((id: string, save: () => void) => {
    if (pending.current.has(id)) return;
    acknowledgeTaskCompleted();
    setCompletingIds((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      pending.current.delete(id);
      save();
      setTimeout(() => {
        setCompletingIds((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, HANDOVER_MS);
    }, ACKNOWLEDGE_MS);
    pending.current.set(id, { timer, save });
  }, []);

  return { completingIds, complete };
}
