/**
 * Recurrence engine — derives the dates on which a recurring task / event
 * should occur within a query window. Materialization (creating real
 * `tasks` rows for occurrences) happens in `recurringTasks.generateInstances`.
 *
 * Scope contract:
 *   - All dates speak the project-wide `YYYYMMDD` 8-character string format
 *     (NO dashes). The format matters because the rest of the app
 *     lex-compares these strings as if they were dates.
 *   - `daysOfWeek` uses JavaScript's `Date.getDay()` convention: 0 = Sunday,
 *     1 = Monday … 6 = Saturday. Productivity-one's Postgres rule stores
 *     the same convention; conversion happens at the API boundary if/when
 *     we import legacy rules.
 *   - "Interval" means "every N {frequency-unit} starting from
 *     `startDateYYYYMMDD`". Every check is made *relative to the rule's
 *     start date*, not relative to "now", so windows that start in the
 *     middle of the cycle still produce the correct dates.
 *
 * Strategy:
 *   We iterate day-by-day across the query window and ask `matchesRule`
 *   for each. A naive O(window * rules) cost is fine for the typical
 *   home-page query (today..today+30) and the calendar query
 *   (week / month). The simpler day-walk avoids subtle off-by-one bugs
 *   in `setDate(getDate() + interval)` arithmetic where DST/month-overflow
 *   can silently shift days.
 */

type RecurrenceRule = {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  daysOfWeek?: number[];
  monthlyPattern?: "DAY_OF_MONTH" | "DAY_OF_WEEK";
  dayOfMonth?: number;
  weekOfMonth?: number;
  dayOfWeekMonthly?: number;
  monthOfYear?: number;
  startDateYYYYMMDD: string;
  endDateYYYYMMDD?: string;
};

export function parseYYYYMMDD(s: string): Date {
  const y = parseInt(s.substring(0, 4));
  const m = parseInt(s.substring(4, 6)) - 1;
  const d = parseInt(s.substring(6, 8));
  return new Date(y, m, d);
}

export function formatYYYYMMDD(d: Date): string {
  const y = d.getFullYear().toString();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}${m}${day}`;
}

export function generateOccurrences(
  rule: RecurrenceRule,
  rangeStart: string,
  rangeEnd: string,
  deletedDates: Set<string>
): string[] {
  const occurrences: string[] = [];

  // Effective start/end of iteration: clamp the rule's [start, end] to the
  // requested query window so we never iterate years of empty calendar.
  const ruleStart = parseYYYYMMDD(rule.startDateYYYYMMDD);
  const ruleEnd = rule.endDateYYYYMMDD
    ? parseYYYYMMDD(rule.endDateYYYYMMDD)
    : null;
  const winStart = parseYYYYMMDD(rangeStart);
  const winEnd = parseYYYYMMDD(rangeEnd);

  const iterStart = ruleStart > winStart ? ruleStart : winStart;
  const iterEnd = ruleEnd && ruleEnd < winEnd ? ruleEnd : winEnd;
  if (iterStart > iterEnd) return occurrences;

  // Cap the loop at a year (~365 iterations) per call as a safety net.
  // Any caller asking for more should be paginating.
  const MAX_ITER_DAYS = 366;

  const cursor = new Date(iterStart);
  let i = 0;
  while (cursor <= iterEnd && i < MAX_ITER_DAYS) {
    const dateStr = formatYYYYMMDD(cursor);
    if (!deletedDates.has(dateStr) && matchesRule(cursor, rule, ruleStart)) {
      occurrences.push(dateStr);
    }
    cursor.setDate(cursor.getDate() + 1);
    i++;
  }

  return occurrences;
}

/**
 * Pure date predicate: does `rule` produce an occurrence on `date`?
 * Reasoning lives entirely in this function so it can be unit-tested
 * (and so that `generateOccurrences` stays a trivial day-walk).
 */
function matchesRule(
  date: Date,
  rule: RecurrenceRule,
  ruleStart: Date
): boolean {
  const interval = Math.max(1, rule.interval);

  switch (rule.frequency) {
    case "DAILY": {
      // "Every N days from start." Compute integer day-difference using
      // millis-divided-by-86400000 — UTC-safe because both dates were
      // built from `new Date(y, m, d)` with the same local TZ.
      const diff = daysBetween(ruleStart, date);
      return diff >= 0 && diff % interval === 0;
    }

    case "WEEKLY": {
      // "Every N weeks from the rule's start week, on selected weekdays."
      // Bucket each date into its Sunday-anchored week index relative to
      // `ruleStart`'s week so the every-N-weeks math doesn't drift across
      // years.
      const diffWeeks = weeksBetween(ruleStart, date);
      if (diffWeeks < 0 || diffWeeks % interval !== 0) return false;

      // Default: just the start-date's weekday if `daysOfWeek` isn't set.
      const days =
        rule.daysOfWeek && rule.daysOfWeek.length > 0
          ? rule.daysOfWeek
          : [ruleStart.getDay()];
      return days.includes(date.getDay());
    }

    case "MONTHLY": {
      const monthsDiff =
        (date.getFullYear() - ruleStart.getFullYear()) * 12 +
        (date.getMonth() - ruleStart.getMonth());
      if (monthsDiff < 0 || monthsDiff % interval !== 0) return false;

      if (rule.monthlyPattern === "DAY_OF_WEEK") {
        // "Nth weekday of the month" (e.g. 2nd Tuesday). Negative
        // weekOfMonth (-1) means "last weekday of month".
        const dow = rule.dayOfWeekMonthly ?? ruleStart.getDay();
        const wom = rule.weekOfMonth ?? 1;
        const target = nthWeekdayOfMonth(
          date.getFullYear(),
          date.getMonth(),
          dow,
          wom
        );
        return target !== null && sameYMD(date, target);
      }

      // Default: DAY_OF_MONTH. Clamp to the month's last day so a rule
      // saying "30th of every month" still fires on Feb 28/29 instead
      // of silently spilling into March.
      const dom = rule.dayOfMonth ?? ruleStart.getDate();
      const lastDay = lastDayOfMonth(date.getFullYear(), date.getMonth());
      return date.getDate() === Math.min(dom, lastDay);
    }

    case "YEARLY": {
      const yearsDiff = date.getFullYear() - ruleStart.getFullYear();
      if (yearsDiff < 0 || yearsDiff % interval !== 0) return false;

      const month = rule.monthOfYear ?? ruleStart.getMonth();
      if (date.getMonth() !== month) return false;

      // Yearly week-based pattern (e.g. "Second Tuesday of March").
      // Productivity-one's UI didn't expose this, but Timeplete's
      // expanded Every-year UI does — we share the schema's
      // `monthlyPattern` + `weekOfMonth` + `dayOfWeekMonthly` fields
      // for both MONTHLY and YEARLY week-based patterns so there's
      // only one set of nth-weekday logic.
      if (rule.monthlyPattern === "DAY_OF_WEEK") {
        const dow = rule.dayOfWeekMonthly ?? ruleStart.getDay();
        const wom = rule.weekOfMonth ?? 1;
        const target = nthWeekdayOfMonth(
          date.getFullYear(),
          month,
          dow,
          wom
        );
        return target !== null && sameYMD(date, target);
      }

      // Default: day-of-month pattern (e.g. "March 15").
      const dom = rule.dayOfMonth ?? ruleStart.getDate();
      const lastDay = lastDayOfMonth(date.getFullYear(), month);
      return date.getDate() === Math.min(dom, lastDay);
    }
  }
}

function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86400000);
}

function weeksBetween(a: Date, b: Date): number {
  // Anchor each date to the start of its Sunday-based week so a Saturday
  // and the following Sunday end up in different weeks (matching the
  // visual calendar grid).
  const aWeek = new Date(a);
  aWeek.setDate(a.getDate() - a.getDay());
  const bWeek = new Date(b);
  bWeek.setDate(b.getDate() - b.getDay());
  return daysBetween(aWeek, bWeek) / 7;
}

function lastDayOfMonth(year: number, monthZeroIndexed: number): number {
  // Trick: day 0 of the *next* month is the last day of `monthZeroIndexed`.
  return new Date(year, monthZeroIndexed + 1, 0).getDate();
}

function sameYMD(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Returns the Date of the nth occurrence of `weekday` in `(year, month)`.
 *   - `weekOfMonth`: 1..5 picks 1st..5th occurrence; -1 picks the LAST
 *     occurrence (productivity-one parity for "Last Tuesday of the month").
 *   - Returns `null` when the requested nth doesn't exist (e.g. asking
 *     for the 5th Friday in a month with only 4).
 */
function nthWeekdayOfMonth(
  year: number,
  monthZeroIndexed: number,
  weekday: number,
  weekOfMonth: number
): Date | null {
  if (weekOfMonth < 0) {
    const last = lastDayOfMonth(year, monthZeroIndexed);
    for (let d = last; d >= 1; d--) {
      const candidate = new Date(year, monthZeroIndexed, d);
      if (candidate.getDay() === weekday) return candidate;
    }
    return null;
  }

  const first = new Date(year, monthZeroIndexed, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  const day = 1 + offset + (weekOfMonth - 1) * 7;
  if (day > lastDayOfMonth(year, monthZeroIndexed)) return null;
  return new Date(year, monthZeroIndexed, day);
}
