import { useConvexAuth, useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { Id } from "../convex/_generated/dataModel";

export function useTimer() {
  const { isAuthenticated } = useConvexAuth();
  const timerData = useQuery(api.timers.get, isAuthenticated ? {} : "skip");
  const startTaskTimer = useMutation(api.timers.startTaskTimer);
  const startTrackableTimer = useMutation(api.timers.startTrackableTimer);
  const stopTimer = useMutation(api.timers.stop);
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
  }, [timerData?._id]);

  return {
    isRunning: !!timerData,
    elapsed: localElapsed,
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
