/**
 * Durable pending-mutation outbox so writes survive tab/app kill.
 * Uses AsyncStorage (web + native). Items are replayed on boot via
 * `useOutboxReplay`.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "timeplete:mutationOutbox:v1";

export type OutboxMutationName =
  | "timers.startTaskTimer"
  | "timers.startTrackableTimer"
  | "timers.stop"
  | "timers.stopWithDuration"
  | "tasks.moveOnDay"
  | "tasks.moveBetweenDays"
  | "tasks.moveBetweenSections"
  | "tasks.upsert";

export type OutboxItem = {
  id: string;
  name: OutboxMutationName;
  args: Record<string, unknown>;
  createdAt: number;
};

async function readAll(): Promise<OutboxItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is OutboxItem =>
        !!x &&
        typeof x === "object" &&
        typeof (x as OutboxItem).id === "string" &&
        typeof (x as OutboxItem).name === "string" &&
        typeof (x as OutboxItem).createdAt === "number" &&
        typeof (x as OutboxItem).args === "object" &&
        (x as OutboxItem).args != null,
    );
  } catch {
    return [];
  }
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

/** Upsert by id (safe if enqueue runs twice for the same clientMutationId). */
export async function outboxEnqueue(item: OutboxItem): Promise<void> {
  const all = await readAll();
  const next = all.filter((x) => x.id !== item.id);
  next.push(item);
  await writeAll(next);
}

export async function outboxRemove(id: string): Promise<void> {
  const all = await readAll();
  const next = all.filter((x) => x.id !== id);
  if (next.length !== all.length) await writeAll(next);
}

export async function outboxList(): Promise<OutboxItem[]> {
  const all = await readAll();
  return [...all].sort((a, b) => a.createdAt - b.createdAt);
}
