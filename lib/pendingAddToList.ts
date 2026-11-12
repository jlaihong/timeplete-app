import { parseAddToListUrl, type AddToListRequest } from "./parseAddToListUrl";

let pending: AddToListRequest | null = null;
const listeners = new Set<(req: AddToListRequest) => void>();

export function reportAddToListUrl(url: string | null | undefined): void {
  if (!url) return;
  const parsed = parseAddToListUrl(url);
  if (!parsed) return;
  pending = parsed;
  for (const listener of listeners) listener(parsed);
}

export function consumePendingAddToList(): AddToListRequest | null {
  const value = pending;
  pending = null;
  return value;
}

export function subscribeAddToList(
  listener: (req: AddToListRequest) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
