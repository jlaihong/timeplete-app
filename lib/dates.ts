export function formatYYYYMMDD(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, "0");
  const d = date.getDate().toString().padStart(2, "0");
  return `${y}${m}${d}`;
}

export function parseYYYYMMDD(s: string): Date {
  const y = parseInt(s.substring(0, 4));
  const m = parseInt(s.substring(4, 6)) - 1;
  const d = parseInt(s.substring(6, 8));
  return new Date(y, m, d);
}

export function todayYYYYMMDD(): string {
  return formatYYYYMMDD(new Date());
}

/* ──────────────────────────────────────────────────────────────────── *
 * Goal-onboarding date helpers (port of productivity-one's
 * `date.utils.ts` weeks/hours math).                                    *
 * ──────────────────────────────────────────────────────────────────── */

/** Parses a YYYYMMDD string and returns a Date, or null when missing. */
export function tryParseYYYYMMDD(s: string | undefined | null): Date | null {
  if (!s) return null;
  if (s.length !== 8) return null;
  return parseYYYYMMDD(s);
}

/** Whole **calendar days** between two YYYYMMDD strings (end - start). */
export function daysBetweenYYYYMMDD(start: string, end: string): number {
  const s = tryParseYYYYMMDD(start);
  const e = tryParseYYYYMMDD(end);
  if (!s || !e) return 0;
  const ms = e.getTime() - s.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

/** Whole **weeks** between two YYYYMMDD strings (rounded). */
export function weeksBetweenYYYYMMDD(start: string, end: string): number {
  const days = daysBetweenYYYYMMDD(start, end);
  return Math.floor(days / 7);
}

/** Whole **hours** between two YYYYMMDD dates assuming midnight boundaries. */
export function hoursBetweenYYYYMMDD(start: string, end: string): number {
  return daysBetweenYYYYMMDD(start, end) * 24;
}

/**
 * Formats a YYYYMMDD string as YYYY-MM-DD for use as the `value` of an
 * `<input type="date">` element on web.
 */
export function yyyymmddToIsoDate(s: string): string {
  if (!s || s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

/** Inverse of `yyyymmddToIsoDate`. */
export function isoDateToYyyymmdd(s: string): string {
  if (!s || s.length < 10) return "";
  return s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10);
}

export function addDays(dateStr: string, days: number): string {
  const d = parseYYYYMMDD(dateStr);
  d.setDate(d.getDate() + days);
  return formatYYYYMMDD(d);
}

export function startOfWeek(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatYYYYMMDD(d);
}

export function endOfWeek(dateStr: string): string {
  const start = startOfWeek(dateStr);
  return addDays(start, 6);
}

export function startOfMonth(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return formatYYYYMMDD(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function endOfMonth(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return formatYYYYMMDD(
    new Date(d.getFullYear(), d.getMonth() + 1, 0)
  );
}

export function startOfYear(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return formatYYYYMMDD(new Date(d.getFullYear(), 0, 1));
}

export function endOfYear(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return formatYYYYMMDD(new Date(d.getFullYear(), 11, 31));
}

export function formatDisplayDate(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatDisplayDateLong(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatMinutesAsHM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatSecondsAsHM(totalSeconds: number): string {
  return formatMinutesAsHM(Math.floor(totalSeconds / 60));
}

/**
 * Match productivity-one's `secondsToHhmm`.
 * - showSeconds=false → "HH:MM" (always shows hours)
 * - showSeconds=true  → "MM:SS" (or "HH:MM:SS" when hours > 0)
 */
export function secondsToHhmm(input: number, showSeconds = false): string {
  if (input == null || !isFinite(input)) return "--:--";
  const negative = input < 0;
  let total = Math.abs(Math.trunc(input));

  const hours = Math.floor(total / 3600);
  total -= hours * 3600;
  const minutes = Math.floor(total / 60);
  const seconds = total - minutes * 60;

  const showHours = !showSeconds || hours > 0;
  const hoursPiece = showHours ? `${String(hours).padStart(2, "0")}:` : "";

  const out =
    hoursPiece +
    (showSeconds
      ? `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      : `${String(minutes).padStart(2, "0")}`);

  return negative ? `-${out}` : out;
}

/**
 * Match productivity-one's `secondsToDurationString`.
 * Returns "--:--" for null/undefined/non-finite values; otherwise delegates to `secondsToHhmm`.
 */
export function secondsToDurationString(
  totalSeconds: number | null | undefined,
  showSeconds = false,
): string {
  if (totalSeconds == null || !isFinite(totalSeconds)) return "--:--";
  return secondsToHhmm(totalSeconds, showSeconds);
}

/**
 * Match productivity-one's `hhmmToSeconds`.
 * Accepts "H:MM", "HH:MM", or just minutes (e.g. "30") which is treated as "0:30".
 * Returns 0 if the value is unparseable.
 */
export function hhmmToSeconds(hhmm: string): number {
  if (!hhmm) return 0;
  let value = hhmm.trim();
  if (!value.includes(":")) {
    value = "0:" + value;
  }
  const [hStr, mStr] = value.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!isFinite(h) || !isFinite(m)) return 0;
  return h * 3600 + m * 60;
}

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Match angular `formatYYYYMMDDtoDDMMM` — "5 Apr" or "5 Apr 2027" if non-current year. */
export function formatYYYYMMDDtoDDMMM(yyyymmdd: string): string {
  const y = yyyymmdd.slice(0, 4);
  const m = parseInt(yyyymmdd.slice(4, 6), 10);
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const segments = [String(d), MONTH_NAMES_SHORT[m - 1]];
  const currentYear = String(new Date().getFullYear());
  if (y !== currentYear) segments.push(y);
  return segments.join(" ");
}

export function isToday(dateStr: string): boolean {
  return dateStr === todayYYYYMMDD();
}

export function isPast(dateStr: string): boolean {
  return dateStr < todayYYYYMMDD();
}

export function getDaysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  let current = start;
  while (current <= end) {
    days.push(current);
    current = addDays(current, 1);
  }
  return days;
}

export function getWeekdayName(dateStr: string): string {
  const d = parseYYYYMMDD(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "short" });
}

export function toISODate(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function fromISODate(iso: string): string {
  return iso.replace(/-/g, "");
}

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];

/** Returns the single-character weekday label ("M", "T", …) for a YYYYMMDD. */
export function getDayOfWeekLetter(yyyymmdd: string): string {
  const d = parseYYYYMMDD(yyyymmdd);
  return WEEKDAY_LETTERS[d.getDay()];
}

/**
 * Returns the 7 YYYYMMDD strings of the week containing `today` starting on
 * Monday (matching productivity-one's `getWeekDates`).
 */
export function getWeekDatesMonStart(today: string = todayYYYYMMDD()): string[] {
  const start = startOfWeek(today);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) out.push(addDays(start, i));
  return out;
}
