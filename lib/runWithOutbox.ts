import {
  outboxEnqueue,
  outboxRemove,
  type OutboxMutationName,
} from "./mutationOutbox";
import { newClientMutationId } from "./clientMutationId";
import { runWithOutboxLifecycle } from "./runWithOutboxLifecycle";

type ArgsWithClientId = Record<string, unknown> & {
  clientMutationId?: string;
};

/**
 * Persist in parallel with mutate, then clear. On failure the outbox row
 * stays for boot replay. Always injects `clientMutationId` so server-side
 * idempotency can skip dupes.
 *
 * Mutate is not gated on persist: Convex optimistic updates run when
 * `mutate()` is called, and waiting for AsyncStorage first made checkbox
 * taps feel like a multi-second network stall on Android Chrome.
 */
export async function runWithOutbox<Args extends ArgsWithClientId, Result>(
  name: OutboxMutationName,
  args: Args,
  mutate: (args: Args & { clientMutationId: string }) => Promise<Result>,
): Promise<Result> {
  const clientMutationId = args.clientMutationId ?? newClientMutationId();
  const full = { ...args, clientMutationId };
  return runWithOutboxLifecycle({
    persist: () =>
      outboxEnqueue({
        id: clientMutationId,
        name,
        args: full as Record<string, unknown>,
        createdAt: Date.now(),
      }),
    mutate: () => mutate(full),
    clear: () => outboxRemove(clientMutationId),
  });
}
