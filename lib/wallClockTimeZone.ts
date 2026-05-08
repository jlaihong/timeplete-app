/**
 * Wall clock fields in an IANA timezone for a UTC instant.
 * Shared by Convex (`finalizeTimer`) and the client (stop-timer optimistic
 * calendar patch) so the calendar day and clock match for the same instant.
 */
export function wallClockInTimeZone(
  epochMs: number,
  timeZone: string,
): { startDayYYYYMMDD: string; startTimeHHMM: string } {
  let tz = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!tz) tz = "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
  } catch {
    tz = "UTC";
  }

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year ?? "1970";
  const m = map.month ?? "01";
  const d = map.day ?? "01";
  let hour = map.hour ?? "00";
  const minute = map.minute ?? "00";
  if (hour === "24") hour = "00";
  return {
    startDayYYYYMMDD: `${y}${m}${d}`,
    startTimeHHMM: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  };
}

/**
 * Parses day column + clock from the calendar grid (what the user sees when
 * they drag the live timer). Returns null if either value is missing/invalid.
 */
export function parseCalendarGridStart(
  dayRaw: string | undefined | null,
  hhmmRaw: string | undefined | null,
): { startDayYYYYMMDD: string; startTimeHHMM: string } | null {
  const day = dayRaw?.trim() ?? "";
  if (day.length !== 8 || !/^\d{8}$/.test(day)) return null;
  if (typeof hhmmRaw !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmmRaw.trim());
  if (!m) return null;
  const h = parseInt(m[1]!, 10);
  const min = parseInt(m[2]!, 10);
  if (
    !Number.isFinite(h) ||
    h < 0 ||
    h > 23 ||
    !Number.isFinite(min) ||
    min < 0 ||
    min > 59
  ) {
    return null;
  }
  return {
    startDayYYYYMMDD: day,
    startTimeHHMM: `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
  };
}

/** Prefer calendar-grid anchor from `timers.adjust`; else wall-clock from epoch. */
export function timerCalendarWallStart(
  calendarStartDayYYYYMMDD: string | undefined | null,
  calendarStartTimeHHMM: string | undefined | null,
  fallbackEpochMs: number,
  timeZone: string,
): { startDayYYYYMMDD: string; startTimeHHMM: string } {
  const parsed = parseCalendarGridStart(
    calendarStartDayYYYYMMDD,
    calendarStartTimeHHMM,
  );
  if (parsed) return parsed;
  return wallClockInTimeZone(fallbackEpochMs, timeZone);
}
