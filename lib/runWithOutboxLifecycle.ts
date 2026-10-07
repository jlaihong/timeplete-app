/**
 * Persist in parallel with mutate so optimistic Convex patches are not
 * blocked on AsyncStorage / IndexedDB (slow on mobile Chrome).
 *
 * Still awaits persist before clear so we never delete an outbox row that
 * has not been written yet.
 */
export async function runWithOutboxLifecycle<T>(opts: {
  persist: () => Promise<void>;
  mutate: () => Promise<T>;
  clear: () => Promise<void>;
}): Promise<T> {
  const persistP = opts.persist();
  try {
    const result = await opts.mutate();
    await persistP;
    await opts.clear();
    return result;
  } catch (err) {
    await persistP.catch(() => undefined);
    throw err;
  }
}
