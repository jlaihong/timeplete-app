/**
 * Canonical 8-char YYYYMMDD strings for comparisons and Map keys.
 *
 * Imports / legacy rows often store `YYYY-MM-DD`. The app and Convex
 * date math (`addDaysYYYYMMDD`, string range checks) assume compact form;
 * mixing formats breaks lookups (`getCompletedTaskCount`) and capped
 * weekly totals (`periodicOverallProgress`).
 */
export function toCompactYYYYMMDD(day: string | undefined | null): string {
  if (day == null || day === "") return "";
  const s = day.trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) return s;
  if (s.length >= 10 && s[4] === "-" && s[7] === "-") {
    const y = s.slice(0, 4);
    const m = s.slice(5, 7);
    const d = s.slice(8, 10);
    if (/^\d{4}$/.test(y) && /^\d{2}$/.test(m) && /^\d{2}$/.test(d)) {
      return `${y}${m}${d}`;
    }
  }
  return s;
}
