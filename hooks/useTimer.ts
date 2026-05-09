import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { deriveEventColors } from "../lib/eventColors";
import { applyStopTimerOptimisticUpdate } from "../lib/stopTimerOptimisticUpdate";

function convexErrorDiagnostics(e: unknown): string {
  const parts: string[] = [];
  if (e instanceof Error) {
    parts.push(e.message);
    const data = (e as Error & { data?: unknown }).data;
    if (data !== undefined) {
      try {
        parts.push(JSON.stringify(data));
      } catch {
        parts.push(String(data));
      }
    }
  }
  try {
    parts.push(JSON.stringify(e));
  } catch {
    parts.push(String(e));
  }
  return parts.join(" ");
}

function isLikelyConvexArgumentMismatch(e: unknown): boolean {
  return /ArgumentValidation|argument validation|invalid argument|validator|unexpected field|extra field|excess property|does not match/i.test(
    convexErrorDiagnostics(e),
  );
}

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
  const resizeLiveTimerMutation = useMutation(api.timers.resizeLiveTimer);
  const syncTimerClientTimeZoneMutation = useMutation(
    api.timers.syncTimerClientTimeZone,
  );
  const setLiveTimerCalendarAnchorMutation = useMutation(
    api.timers.setLiveTimerCalendarAnchor,
  );

  const commitLiveTimerResize = useCallback(
    async (
      startTimeEpochMs: number,
      calendarStartDayYYYYMMDD: string,
      calendarStartTimeHHMM: string,
    ) => {
      const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      try {
        await resizeLiveTimerMutation({
          startTimeEpochMs,
          calendarStartDayYYYYMMDD,
          calendarStartTimeHHMM,
          clientTimeZone,
        });
        return;
      } catch {
        /* Older deployment: no combined mutation */
      }
      await adjustTimer({ startTimeEpochMs });
      try {
        await syncTimerClientTimeZoneMutation({ clientTimeZone });
      } catch {
        /* sync mutation missing */
      }
      try {
        await setLiveTimerCalendarAnchorMutation({
          calendarStartDayYYYYMMDD,
          calendarStartTimeHHMM,
        });
      } catch {
        /* Older deployment: no anchor */
      }
    },
    [
      adjustTimer,
      resizeLiveTimerMutation,
      syncTimerClientTimeZoneMutation,
      setLiveTimerCalendarAnchorMutation,
    ],
  );

  // Trackable-only timers: if the deployment’s `timers.get` has not picked up
  // display fields yet, resolve name + colour from the long-lived
  // `trackables.search` query (no new Convex functions required). Task timers
  // still need `timers.get` enrichment on the server.
  const trackableDisplayIncomplete =
    !!timerData &&
    !!timerData.trackableId &&
    !timerData.taskId &&
    (timerData.displayTitle == null ||
      String(timerData.displayTitle).trim() === "" ||
      timerData.displayColor == null);

  const trackablesList = useQuery(
    api.trackables.search,
    profileReady && trackableDisplayIncomplete ? {} : "skip",
  );

  const { displayTitle, displayColor, secondaryColor } = useMemo(() => {
    let title = timerData?.displayTitle?.trim() || undefined;
    let color = timerData?.displayColor;
    let secondary = timerData?.secondaryColor;

    if (
      trackableDisplayIncomplete &&
      timerData?.trackableId &&
      trackablesList
    ) {
      const tr = trackablesList.find((t) => t._id === timerData.trackableId);
      if (tr) {
        if (!title) title = tr.name;
        if (color == null) {
          const c = deriveEventColors(tr.colour, undefined);
          color = c.displayColor;
          secondary = c.secondaryColor;
        }
      }
    }

    return {
      displayTitle: title,
      displayColor: color,
      secondaryColor: secondary,
    };
  }, [
    timerData?.displayTitle,
    timerData?.displayColor,
    timerData?.secondaryColor,
    timerData?.trackableId,
    timerData?.taskId,
    trackableDisplayIncomplete,
    trackablesList,
  ]);

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
  }, [timerData?._id, timerData?.startTime, timerData?.calendarStartDayYYYYMMDD, timerData?.calendarStartTimeHHMM]);

  const stop = useCallback(async () => {
    const clientTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    try {
      await stopTimer({ clientTimeZone });
    } catch (e) {
      if (!isLikelyConvexArgumentMismatch(e)) throw e;
      /* Older deployment: `stop` has no args */
      await stopTimer({});
    }
  }, [stopTimer]);

  return {
    isRunning: !!timerData,
    elapsed: localElapsed,
    displayTitle,
    displayColor,
    secondaryColor,
    taskId: timerData?.taskId ?? null,
    trackableId: timerData?.trackableId ?? null,
    startForTask: (taskId: Id<"tasks">, timeZone: string) =>
      startTaskTimer({ taskId, timeZone }),
    startForTrackable: (trackableId: Id<"trackables">, timeZone: string) =>
      startTrackableTimer({ trackableId, timeZone }),
    stop,
    commitLiveTimerResize,
    timeZone:
      timerData?.timeZone ??
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    calendarStartDayYYYYMMDD: timerData?.calendarStartDayYYYYMMDD ?? null,
    calendarStartTimeHHMM: timerData?.calendarStartTimeHHMM ?? null,
  };
}
