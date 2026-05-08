import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef, useMemo } from "react";
import { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { applyStopTimerOptimisticUpdate } from "../lib/stopTimerOptimisticUpdate";

export function useTimer() {
  const { profileReady } = useAuth();
  const timerData = useQuery(api.timers.get, profileReady ? {} : "skip");

  // When `timers.get` is served by an older deployment (or the row lacks
  // embedded display fields), fetch title + colours the same way as the
  // server helper — keeps the calendar live tile correct without relying on
  // a single query shape.
  const serverDisplayIncomplete =
    !timerData ||
    timerData.displayTitle == null ||
    timerData.displayTitle.trim() === "" ||
    timerData.displayColor == null;

  const useTaskTimerFallback =
    !!timerData?.taskId && serverDisplayIncomplete;
  const useTrackableTimerFallback =
    !!timerData?.trackableId &&
    !timerData.taskId &&
    serverDisplayIncomplete;

  const taskTimerDisplay = useQuery(
    api.tasks.getTimerDisplayForTask,
    profileReady && useTaskTimerFallback && timerData?.taskId
      ? { taskId: timerData.taskId }
      : "skip",
  );
  const trackableTimerDisplay = useQuery(
    api.trackables.getTimerDisplayForTrackable,
    profileReady && useTrackableTimerFallback && timerData?.trackableId
      ? { trackableId: timerData.trackableId }
      : "skip",
  );

  const mergedDisplay = useMemo(() => {
    const title =
      timerData?.displayTitle?.trim() ||
      taskTimerDisplay?.displayTitle?.trim() ||
      trackableTimerDisplay?.displayTitle?.trim() ||
      undefined;
    const color =
      timerData?.displayColor ??
      taskTimerDisplay?.displayColor ??
      trackableTimerDisplay?.displayColor;
    const secondary =
      timerData?.secondaryColor ??
      taskTimerDisplay?.secondaryColor ??
      trackableTimerDisplay?.secondaryColor;
    return { displayTitle: title, displayColor: color, secondaryColor: secondary };
  }, [
    timerData?.displayTitle,
    timerData?.displayColor,
    timerData?.secondaryColor,
    taskTimerDisplay?.displayTitle,
    taskTimerDisplay?.displayColor,
    taskTimerDisplay?.secondaryColor,
    trackableTimerDisplay?.displayTitle,
    trackableTimerDisplay?.displayColor,
    trackableTimerDisplay?.secondaryColor,
  ]);

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
    displayTitle: mergedDisplay.displayTitle,
    displayColor: mergedDisplay.displayColor,
    secondaryColor: mergedDisplay.secondaryColor,
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
