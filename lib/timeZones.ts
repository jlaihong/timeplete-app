/**
 * IANA timezone helpers for the "Use Time Zone" calendar UI.
 */

const FALLBACK_TIME_ZONES = [
  "UTC",
  "America/Vancouver",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

/** Device / browser IANA zone, falling back to UTC. */
export function deviceTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof tz === "string" && tz.trim() !== "") return tz.trim();
  } catch {
    // ignore
  }
  return "UTC";
}

/** Sorted list of IANA zones for a picker; always includes `preferred`. */
export function listTimeZones(preferred?: string): string[] {
  let zones: string[] = FALLBACK_TIME_ZONES;
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (Array.isArray(supported) && supported.length > 0) {
      zones = supported;
    }
  } catch {
    // keep fallback
  }
  const set = new Set(zones);
  if (preferred && preferred.trim() !== "") set.add(preferred.trim());
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}
