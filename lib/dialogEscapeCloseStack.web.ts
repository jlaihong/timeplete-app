type Closer = () => void;

interface Entry {
  id: number;
  close: Closer;
}

const stack: Entry[] = [];
let nextId = 0;
let documentListener: ((e: KeyboardEvent) => void) | null = null;

function onDocumentKeyDown(e: KeyboardEvent) {
  if (e.key !== "Escape") return;
  const top = stack[stack.length - 1];
  if (!top) return;
  e.preventDefault();
  e.stopPropagation();
  top.close();
}

function attachIfNeeded() {
  if (typeof document === "undefined" || documentListener) return;
  documentListener = onDocumentKeyDown;
  document.addEventListener("keydown", documentListener, false);
}

function detachIfEmpty() {
  if (stack.length > 0 || !documentListener) return;
  document.removeEventListener("keydown", documentListener, false);
  documentListener = null;
}

/**
 * Registers a closable layer for the Escape key (web only).
 * Last registered handler runs first so nested overlays dismiss in order.
 */
export function registerDialogEscape(onClose: Closer): () => void {
  if (typeof document === "undefined") return () => {};

  const id = ++nextId;
  stack.push({ id, close: onClose });
  attachIfNeeded();

  return () => {
    const i = stack.findIndex((e) => e.id === id);
    if (i !== -1) stack.splice(i, 1);
    detachIfEmpty();
  };
}
