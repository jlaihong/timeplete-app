/**
 * Canonical 8-char YYYYMMDD strings for comparisons and Map keys.
 *
 * Imports / legacy rows often store `YYYY-MM-DD`. The app and Convex
 * date math (`addDaysYYYYMMDD`, string range checks) assume compact form;
 * mixing formats breaks lookups (`getCompletedTaskCount`) and capped
 * weekly totals (`periodicOverallProgress`).
 *
 * Anything we cannot confidently normalize returns `""` so callers skip
 * range math instead of concatenating malformed strings (`return s`).
 */
export function toCompactYYYYMMDD(day: string | undefined | null): string {
  if (day == null || day === "") return "";
  const s = day.trim();
  if (s.length === 8 && /^\d{8}$/.test(s)) return s;
  const head = s.slice(0, 10);
  const dash = /^(\d{4})-(\d{2})-(\d{2})$/.exec(head);
  if (dash) return `${dash[1]}${dash[2]}${dash[3]}`;
  const slash = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(head);
  if (slash) return `${slash[1]}${slash[2]}${slash[3]}`;
  return "";
}

/** True iff `day` is a normalized compact calendar day (YYYYMMDD). */
export function isYYYYMMDDCompact(day: string | undefined | null): boolean {
  return !!day && day.length === 8 && /^\d{8}$/.test(day);
}
