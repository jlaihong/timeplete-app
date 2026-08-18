/**
 * Replay durable outbox mutations after auth is ready.
 * Uses the same optimistic-wired mutation functions so UI stays consistent.
 */
import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./useAuth";
import { outboxList, outboxRemove } from "../lib/mutationOutbox";
import {
  applyMoveBetweenDaysOptimisticUpdate,
  applyMoveBetweenSectionsOptimisticUpdate,
  applyMoveOnDayOptimisticUpdate,
} from "../lib/taskMoveOptimisticUpdate";
import { applyTaskUpsertOptimisticUpdate } from "../lib/taskUpsertOptimisticUpdate";
import {
  applyStartTaskTimerOptimisticUpdate,
  applyStartTrackableTimerOptimisticUpdate,
} from "../lib/startTimerOptimisticUpdate";
import { applyStopTimerOptimisticUpdate } from "../lib/stopTimerOptimisticUpdate";

export function useOutboxReplay() {
  const { profileReady } = useAuth();
  /** Bump only when auth becomes ready so mutation identity churn doesn't re-fire. */
  const replayGen = useRef(0);

  const startTaskTimer = useMutation(api.timers.startTaskTimer).withOptimisticUpdate(
    (localStore, args) => {
      applyStartTaskTimerOptimisticUpdate(localStore, args);
    },
  );
  const startTrackableTimer = useMutation(
    api.timers.startTrackableTimer,
  ).withOptimisticUpdate((localStore, args) => {
    applyStartTrackableTimerOptimisticUpdate(localStore, args);
  });
  const stopTimer = useMutation(api.timers.stop).withOptimisticUpdate(
    (localStore) => {
      applyStopTimerOptimisticUpdate(localStore);
    },
  );
  const stopWithDuration = useMutation(
    api.timers.stopWithDuration,
  ).withOptimisticUpdate((localStore, args) => {
    applyStopTimerOptimisticUpdate(localStore, {
      elapsedSeconds: args.durationSeconds,
      startTimeEpochMs: args.startTimeEpochMs,
    });
  });
  const moveOnDay = useMutation(api.tasks.moveOnDay).withOptimisticUpdate(
    (localStore, args) => {
      applyMoveOnDayOptimisticUpdate(localStore, args);
    },
  );
  const moveBetweenDays = useMutation(
    api.tasks.moveBetweenDays,
  ).withOptimisticUpdate((localStore, args) => {
    applyMoveBetweenDaysOptimisticUpdate(localStore, args);
  });
  const moveBetweenSections = useMutation(
    api.tasks.moveBetweenSections,
  ).withOptimisticUpdate((localStore, args) => {
    applyMoveBetweenSectionsOptimisticUpdate(localStore, args);
  });
  const upsertTask = useMutation(api.tasks.upsert).withOptimisticUpdate(
    applyTaskUpsertOptimisticUpdate,
  );

  useEffect(() => {
    if (!profileReady) return;
    const gen = ++replayGen.current;
    let cancelled = false;

    (async () => {
      const items = await outboxList();
      for (const item of items) {
        if (cancelled || gen !== replayGen.current) break;
        try {
          switch (item.name) {
            case "timers.startTaskTimer":
              await startTaskTimer(item.args as never);
              break;
            case "timers.startTrackableTimer":
              await startTrackableTimer(item.args as never);
              break;
            case "timers.stop":
              await stopTimer(item.args as never);
              break;
            case "timers.stopWithDuration":
              await stopWithDuration(item.args as never);
              break;
            case "tasks.moveOnDay":
              await moveOnDay(item.args as never);
              break;
            case "tasks.moveBetweenDays":
              await moveBetweenDays(item.args as never);
              break;
            case "tasks.moveBetweenSections":
              await moveBetweenSections(item.args as never);
              break;
            case "tasks.upsert":
              await upsertTask(item.args as never);
              break;
            default:
              break;
          }
          await outboxRemove(item.id);
        } catch (err) {
          console.warn("[outbox] replay failed", item.name, item.id, err);
          // Leave item for a later attempt.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // Intentionally omit mutation fns: Convex hooks are stable enough per mount,
    // and including them re-triggers Strict Mode double-replay races.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileReady]);
}
