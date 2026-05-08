/**
 * Wall clock fields in an IANA timezone for a UTC instant.
 * Used when persisting `timeWindows` so calendar day/range matches the user's
 * `Intl` calendar (Convex servers typically run in UTC; `Date#getHours` is wrong).
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
