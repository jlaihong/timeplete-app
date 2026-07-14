import { useCallback, useEffect, useRef, useState } from "react";
import {
  assessDurationHhMmInput,
  hhmmToSeconds,
  todayYYYYMMDD,
} from "../../../../lib/dates";
import { defaultStartTimeQuarterHour } from "../../../../lib/trackableLogPresets";

/**
 * Start-time state for the "Add progress" time-logging dialogs.
 *
 * The user enters the DURATION first; the start time then defaults to
 * "I just finished doing this": now minus the duration, recomputed every
 * time the duration changes — until the user edits the start time
 * themselves, at which point their choice wins and auto-derivation stops.
 *
 * The "now − duration" story only makes sense when logging for TODAY.
 * When `dayYYYYMMDD` points at another day (backfilling a past day via
 * the date field / progress calendar), the current wall-clock time is
 * meaningless, so auto-derivation is suspended and the field just holds
 * its last value until the user sets it.
 */
export function useDurationDrivenStartTime(
  durationHhmm: string,
  dayYYYYMMDD?: string,
) {
  // Quarter-hour-snapped "now" until a duration exists to subtract.
  const [startTime, setStartTime] = useState(defaultStartTimeQuarterHour);
  const userEditedRef = useRef(false);

  const isToday = dayYYYYMMDD == null || dayYYYYMMDD === todayYYYYMMDD();

  useEffect(() => {
    if (userEditedRef.current) return;
    if (!isToday) return;
    if (assessDurationHhMmInput(durationHhmm, false) !== "valid") return;
    const seconds = hhmmToSeconds(durationHhmm);
    if (!isFinite(seconds) || seconds <= 0) return;
    setStartTime(startTimeEndingNow(seconds));
  }, [durationHhmm, isToday]);

  const onStartTimeChange = useCallback((hhmm: string) => {
    userEditedRef.current = true;
    setStartTime(hhmm);
  }, []);

  return { startTime, onStartTimeChange };
}

/** HH:MM for (now − durationSeconds), clamped to today's midnight so the
 *  derived start never wraps into the previous day. */
function startTimeEndingNow(durationSeconds: number): string {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const start = new Date(
    Math.max(now.getTime() - durationSeconds * 1000, midnight.getTime()),
  );
  return `${String(start.getHours()).padStart(2, "0")}:${String(
    start.getMinutes(),
  ).padStart(2, "0")}`;
}
