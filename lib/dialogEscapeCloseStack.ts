import { Platform } from "react-native";

type Closer = () => void;

interface Entry {
  id: number;
  close: Closer;
}

const stack: Entry[] = [];
let nextId = 0;
let windowListener: ((e: KeyboardEvent) => void) | null = null;

function escapeStackEnabled(): boolean {
  return (
    Platform.OS === "web" &&
    typeof window !== "undefined" &&
    typeof window.addEventListener === "function"
  );
}

function onWindowKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape" && e.code !== "Escape") {
    return;
  }
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.close();
}

function attachIfNeeded() {
  if (!escapeStackEnabled() || windowListener) return;
  windowListener = onWindowKeyDown;
  // Capture phase on `window` so we still see Escape when focus is inside
  // RN Web / shadow DOM inputs that stop bubbling to `document`.
  window.addEventListener("keydown", windowListener, true);
}

function detachIfEmpty() {
  if (stack.length > 0 || !windowListener) return;
  if (typeof window !== "undefined") {
    window.removeEventListener("keydown", windowListener, true);
  }
  windowListener = null;
}

/**
 * Registers a closable layer for the Escape key on web.
 * Last registered handler runs first so nested overlays dismiss in order.
 * On iOS/Android this is a no-op.
 */
export function registerDialogEscape(onClose: Closer): () => void {
  if (!escapeStackEnabled()) return () => {};

  const id = ++nextId;
  stack.push({ id, close: onClose });
  attachIfNeeded();

  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i !== -1) stack.splice(i, 1);
    detachIfEmpty();
  };
}
