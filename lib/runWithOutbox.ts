import {
  outboxEnqueue,
  outboxRemove,
  type OutboxMutationName,
} from "./mutationOutbox";
import { newClientMutationId } from "./clientMutationId";

type ArgsWithClientId = Record<string, unknown> & {
  clientMutationId?: string;
};

/**
 * Persist → mutate → clear. On failure the outbox row stays for boot replay.
 * Always injects `clientMutationId` so server-side idempotency can skip dupes.
 */
export async function runWithOutbox<Args extends ArgsWithClientId, Result>(
  name: OutboxMutationName,
  args: Args,
  mutate: (args: Args & { clientMutationId: string }) => Promise<Result>,
): Promise<Result> {
  const clientMutationId = args.clientMutationId ?? newClientMutationId();
  const full = { ...args, clientMutationId };
  await outboxEnqueue({
    id: clientMutationId,
    name,
    args: full as Record<string, unknown>,
    createdAt: Date.now(),
  });
  try {
    const result = await mutate(full);
    await outboxRemove(clientMutationId);
    return result;
  } catch (err) {
    // Keep outbox item for replay.
    throw err;
  }
}
