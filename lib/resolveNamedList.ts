export type NamedList = {
  name: string;
  archived?: boolean;
};

const GROCERY_ALIASES = ["grocery", "groceries", "grocery list"];

function normalizeListHint(hint: string): string[] {
  const q = hint.trim().toLowerCase();
  if (!q) return [];
  if (GROCERY_ALIASES.includes(q)) return GROCERY_ALIASES;
  return [q];
}

/** Pick a user list by spoken name. Grocery aliases match "Grocery" / "Groceries". */
export function resolveNamedList<T extends NamedList>(
  lists: readonly T[],
  hint: string,
): T | undefined {
  const aliases = normalizeListHint(hint);
  if (aliases.length === 0) return undefined;
  const active = lists.filter((l) => !l.archived);
  const exact = active.find((l) =>
    aliases.includes(l.name.trim().toLowerCase()),
  );
  if (exact) return exact;
  return active.find((l) => {
    const n = l.name.trim().toLowerCase();
    return aliases.some((a) => n.includes(a));
  });
}

export function defaultCreatedListName(hint: string): string {
  const q = hint.trim().toLowerCase();
  if (!q || GROCERY_ALIASES.includes(q)) return "Grocery";
  return hint.trim();
}
