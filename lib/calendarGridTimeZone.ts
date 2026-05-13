/**
 * Calendar day columns mirror `CalendarView`'s hourly grid TZ (see `useTimer`):
 * canonical timer zone while ticking; otherwise the browser/OS zone.
 */

export function validatedOptionalIANATimeZone(
  raw: string | undefined | null,
): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: t }).format(0);
  } catch {
    return null;
  }
  return t;
}

/** Matches {@link components/shared/CalendarView} `gridTimeZone`. */
export function calendarGridIANAZoneForManualEvents(opts: {
  isTimerRunning: boolean;
  canonicalTimerIANAZone: string | null | undefined;
}): string {
  const rowRaw =
    opts.isTimerRunning && opts.canonicalTimerIANAZone != null
      ? String(opts.canonicalTimerIANAZone).trim()
      : "";

  const fromTimer =
    rowRaw !== "" ? validatedOptionalIANATimeZone(rowRaw) : null;

  if (fromTimer) return fromTimer;

  const local =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone.trim() || ""
      : "";
  return validatedOptionalIANATimeZone(local) ?? "UTC";
}
