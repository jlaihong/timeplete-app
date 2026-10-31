/**
 * A press on a day pill, timer, or "Add progress" button should not start
 * a card reorder. The card itself is the drag handle (productivity-one
 * `cdkDrag` on the goal widget). Stopping the pointer event here keeps
 * those controls clickable.
 */
export function stopTrackableDrag(e?: {
  stopPropagation?: () => void;
  nativeEvent?: {
    stopPropagation?: () => void;
    stopImmediatePropagation?: () => void;
  };
}) {
  e?.stopPropagation?.();
  e?.nativeEvent?.stopPropagation?.();
  e?.nativeEvent?.stopImmediatePropagation?.();
}

let suppressTrackablePressUntil = 0;

/** A finished drag should not also open the trackable. */
export function suppressTrackablePress() {
  suppressTrackablePressUntil = Date.now() + 400;
}

export function shouldIgnoreTrackablePress() {
  return Date.now() < suppressTrackablePressUntil;
}
