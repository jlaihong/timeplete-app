/** Native: Escape stack is a no-op (see `.web.ts` for web implementation). */
export function registerDialogEscape(_onClose: () => void): () => void {
  return () => {};
}
