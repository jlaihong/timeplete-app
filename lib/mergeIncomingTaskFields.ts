/**
 * Keep local drag order, but take newer row fields from an incoming query
 * snapshot (optimistic `dateCompleted`, time spent, etc.).
 *
 * Used while a drag is live or a reorder mutation is in flight so a checkbox
 * tap is not stuck waiting for the drag to finish and the server to refresh.
 *
 * `dropMissing` removes local rows the incoming snapshot no longer contains.
 * List detail passes a list that already hides completed tasks, so a check
 * has to drop the row. Home keeps omitted rows because its snapshot still
 * includes them and filters later.
 */
export function mergeIncomingTaskFields<
  T extends { _id: unknown },
  G extends { id: string; tasks: readonly T[] },
>(
  local: readonly G[],
  incoming: readonly G[],
  pickGroupFields?: (incomingGroup: G, localGroup: G) => Partial<G>,
  options?: { dropMissing?: boolean },
): G[] {
  const byId = new Map<string, T>();
  const incomingById = new Map<string, G>();
  for (const g of incoming) {
    incomingById.set(g.id, g);
    for (const t of g.tasks) {
      byId.set(String(t._id), t);
    }
  }
  return local.map((g) => {
    const incomingG = incomingById.get(g.id);
    const tasks = options?.dropMissing
      ? g.tasks.flatMap((t) => {
          const next = byId.get(String(t._id));
          return next ? [next] : [];
        })
      : g.tasks.map((t) => byId.get(String(t._id)) ?? t);
    const next = { ...g, tasks } as G;
    if (incomingG && pickGroupFields) {
      return { ...next, ...pickGroupFields(incomingG, g) };
    }
    return next;
  });
}
