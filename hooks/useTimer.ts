import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { applyStopTimerOptimisticUpdate } from "../lib/stopTimerOptimisticUpdate";

export function useTimer() {
  const { profileReady } = useAuth();
  const timerData = useQuery(api.timers.get, profileReady ? {} : "skip");
  const startTaskTimer = useMutation(api.timers.startTaskTimer);
  const startTrackableTimer = useMutation(api.timers.startTrackableTimer);
  const stopTimer = useMutation(api.timers.stop).withOptimisticUpdate(
    (localStore) => {
      applyStopTimerOptimisticUpdate(localStore);
    },
  );
  const adjustTimer = useMutation(api.timers.adjust);

  const [localElapsed, setLocalElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (timerData) {
      setLocalElapsed(timerData.elapsedSeconds);

      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => {
        setLocalElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      setLocalElapsed(0);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // `_id` covers start/stop; `startTime` covers `timers.adjust` (same row, new baseline).
  }, [timerData?._id, timerData?.startTime]);

  return {
    isRunning: !!timerData,
    elapsed: localElapsed,
    displayTitle: timerData?.displayTitle,
    displayColor: timerData?.displayColor,
    secondaryColor: timerData?.secondaryColor,
    taskId: timerData?.taskId ?? null,
    trackableId: timerData?.trackableId ?? null,
    startForTask: (taskId: Id<"tasks">, timeZone: string) =>
      startTaskTimer({ taskId, timeZone }),
    startForTrackable: (trackableId: Id<"trackables">, timeZone: string) =>
      startTrackableTimer({ trackableId, timeZone }),
    stop: () => stopTimer(),
    adjust: (startTimeEpochMs: number) =>
      adjustTimer({ startTimeEpochMs }),
  };
}
