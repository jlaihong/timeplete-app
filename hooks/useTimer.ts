import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Id } from "../convex/_generated/dataModel";
import { useAuth } from "./useAuth";
import { deriveEventColors } from "../lib/eventColors";
import {
  applyStartTaskTimerOptimisticUpdate,
  applyStartTrackableTimerOptimisticUpdate,
} from "../lib/startTimerOptimisticUpdate";
import { applyStopTimerOptimisticUpdate } from "../lib/stopTimerOptimisticUpdate";
import { runWithOutbox } from "../lib/runWithOutbox";

/**
 * Seconds elapsed since `startTime` (epoch ms), re-rendering the caller
 * once per second while enabled.
 *
 * PERFORMANCE: subscribe from small LEAF components only (the text that
 * actually displays the number). `useTimer()` itself deliberately does
 * NOT tick — it used to, and because every mounted tab screen calls it
 * (task list, calendar, trackable widgets), all of them re-rendered
 * top-down every second whenever a timer ran. On a mid-range phone that
 * burned ~185ms of JS thread per tick with four tabs mounted, so tab
 * presses queued behind background renders and felt ~1s laggy.
 *
 * Pass `null` to pause (e.g. when this row isn't the ticking one).
 * `intervalMs` can be raised (e.g. 60_000) where second-resolution
 * isn't visible, like the calendar's live event block.
 */
export function useTimerElapsed(
  startTime: number | null | undefined,
  intervalMs = 1000,
): number {
  const compute = () =>
    startTime != null
      ? Math.max(0, Math.floor((Date.now() - startTime) / 1000))
      : 0;
  const [elapsed, setElapsed] = useState(compute);

  useEffect(() => {
    if (startTime == null) {
      setElapsed(0);
      return;
    }
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startTime) / 1000)));
    tick();
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [startTime, intervalMs]);

  return elapsed;
}

export function useTimer() {
  const { profileReady } = useAuth();
  const timerData = useQuery(api.timers.get, profileReady ? {} : "skip");
  const startTaskTimerRaw = useMutation(
    api.timers.startTaskTimer,
  ).withOptimisticUpdate((localStore, args) => {
    applyStartTaskTimerOptimisticUpdate(localStore, args);
  });
  const startTrackableTimerRaw = useMutation(
    api.timers.startTrackableTimer,
  ).withOptimisticUpdate((localStore, args) => {
    applyStartTrackableTimerOptimisticUpdate(localStore, args);
  });
  const stopTimerRaw = useMutation(api.timers.stop).withOptimisticUpdate(
    (localStore) => {
      applyStopTimerOptimisticUpdate(localStore);
    },
  );
  const adjustTimer = useMutation(api.timers.adjust);

  const startTaskTimer = useCallback(
    (args: { taskId: Id<"tasks">; timeZone: string }) =>
      runWithOutbox("timers.startTaskTimer", args, (a) => startTaskTimerRaw(a)),
    [startTaskTimerRaw],
  );
  const startTrackableTimer = useCallback(
    (args: { trackableId: Id<"trackables">; timeZone: string }) =>
      runWithOutbox("timers.startTrackableTimer", args, (a) =>
        startTrackableTimerRaw(a),
      ),
    [startTrackableTimerRaw],
  );
  const stopTimer = useCallback(
    () => runWithOutbox("timers.stop", {}, (a) => stopTimerRaw(a)),
    [stopTimerRaw],
  );

  const commitLiveTimerResize = useCallback(
    async (startTimeEpochMs: number) => {
      await adjustTimer({ startTimeEpochMs });
    },
    [adjustTimer],
  );

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

  const rowTz =
    typeof timerData?.timeZone === "string" && timerData.timeZone.trim() !== ""
      ? timerData.timeZone.trim()
      : null;

  return {
    isRunning: !!timerData,
    /**
     * Epoch ms the running timer started at, or null. To display a live
     * elapsed count, pass this to {@link useTimerElapsed} from a small
     * leaf component — `useTimer` itself intentionally does not tick.
     */
    startTime: timerData?.startTime ?? null,
    displayTitle,
    displayColor,
    secondaryColor,
    taskId: timerData?.taskId ?? null,
    trackableId: timerData?.trackableId ?? null,
    startForTask: (taskId: Id<"tasks">, timeZone: string) =>
      startTaskTimer({ taskId, timeZone }),
    startForTrackable: (trackableId: Id<"trackables">, timeZone: string) =>
      startTrackableTimer({ trackableId, timeZone }),
    stop: () => stopTimer(),
    commitLiveTimerResize,
    /** IANA zone stored on the active `taskTimers` row — never a device fallback. */
    canonicalTimeZone: rowTz,
    /** @deprecated Prefer `canonicalTimeZone`; kept for call sites expecting `timeZone`. */
    timeZone: rowTz,
  };
}
