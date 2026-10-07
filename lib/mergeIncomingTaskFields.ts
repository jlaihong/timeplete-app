/**
 * Keep local drag order, but take newer row fields from an incoming query
 * snapshot (optimistic `dateCompleted`, time spent, etc.).
 *
 * Used while a drag is live or a reorder mutation is in flight so a checkbox
 * tap is not stuck waiting for the drag to finish and the server to refresh.
 */
export function mergeIncomingTaskFields<
  T extends { _id: unknown },
  G extends { id: string; tasks: readonly T[] },
>(
  local: readonly G[],
  incoming: readonly G[],
  pickGroupFields?: (incomingGroup: G, localGroup: G) => Partial<G>,
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
    const tasks = g.tasks.map((t) => byId.get(String(t._id)) ?? t);
    const next = { ...g, tasks } as G;
    if (incomingG && pickGroupFields) {
      return { ...next, ...pickGroupFields(incomingG, g) };
    }
    return next;
  });
}
