/**
 * The period a review covers, for each review frequency. A review is stored
 * against the first day of its period (`dayUnderReview`): the day itself,
 * the Monday of the week, the 1st of the month, or 1 January.
 */
import {
  addDays,
  endOfMonth,
  endOfYear,
  formatDisplayDate,
  parseYYYYMMDD,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "./dates";
import type { ReviewFrequency } from "./reviewParity";

const pad = (n: number) => String(n).padStart(2, "0");
const toKey = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** First day of the period containing `day`: the key reviews are saved under. */
export function reviewPeriodStart(freq: ReviewFrequency, day: string): string {
  switch (freq) {
    case "DAILY":
      return day;
    case "WEEKLY":
      return startOfWeek(day);
    case "MONTHLY":
      return startOfMonth(day);
    case "YEARLY":
      return startOfYear(day);
  }
}

export function reviewPeriodEnd(freq: ReviewFrequency, day: string): string {
  switch (freq) {
    case "DAILY":
      return day;
    case "WEEKLY":
      return addDays(startOfWeek(day), 6);
    case "MONTHLY":
      return endOfMonth(day);
    case "YEARLY":
      return endOfYear(day);
  }
}

/** The period before (`-1`) or after (`1`) the one starting on `start`. */
export function shiftReviewPeriod(
  freq: ReviewFrequency,
  start: string,
  direction: -1 | 1,
): string {
  const d = parseYYYYMMDD(start);
  switch (freq) {
    case "DAILY":
      return addDays(start, direction);
    case "WEEKLY":
      return addDays(start, 7 * direction);
    case "MONTHLY":
      return toKey(new Date(d.getFullYear(), d.getMonth() + direction, 1));
    case "YEARLY":
      return toKey(new Date(d.getFullYear() + direction, 0, 1));
  }
}

/** "Thu, Nov 12" · "Nov 9 – 15" · "November 2026" · "2026". */
export function reviewPeriodLabel(freq: ReviewFrequency, start: string): string {
  const d = parseYYYYMMDD(start);
  switch (freq) {
    case "DAILY":
      return formatDisplayDate(start);
    case "WEEKLY": {
      const end = parseYYYYMMDD(addDays(start, 6));
      const month = (x: Date) =>
        x.toLocaleDateString(undefined, { month: "short" });
      return end.getMonth() === d.getMonth()
        ? `${month(d)} ${d.getDate()} – ${end.getDate()}`
        : `${month(d)} ${d.getDate()} – ${month(end)} ${end.getDate()}`;
    }
    case "MONTHLY":
      return d.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    case "YEARLY":
      return String(d.getFullYear());
  }
}

/** What "go to the current period" is called for each frequency. */
export function currentPeriodName(freq: ReviewFrequency): string {
  switch (freq) {
    case "DAILY":
      return "Today";
    case "WEEKLY":
      return "This week";
    case "MONTHLY":
      return "This month";
    case "YEARLY":
      return "This year";
  }
}

export type ReviewMarker = { start: string; label: string };

/**
 * The sibling periods shown as "reviewed" markers around the selected one:
 * the days of its week, the weeks starting in its month, or the months of
 * its year. Years have none.
 */
export function reviewMarkers(
  freq: ReviewFrequency,
  start: string,
): ReviewMarker[] {
  const d = parseYYYYMMDD(start);
  switch (freq) {
    case "DAILY": {
      const monday = startOfWeek(start);
      return ["M", "T", "W", "T", "F", "S", "S"].map((label, i) => ({
        start: addDays(monday, i),
        label,
      }));
    }
    case "WEEKLY": {
      // Weeks that overlap the month the selected week mostly sits in
      // (its Thursday), so the row is stable as you step through a month.
      const thursday = parseYYYYMMDD(addDays(start, 3));
      const monthStart = toKey(
        new Date(thursday.getFullYear(), thursday.getMonth(), 1),
      );
      const monthEnd = endOfMonth(monthStart);
      const out: ReviewMarker[] = [];
      for (
        let monday = startOfWeek(monthStart);
        monday <= monthEnd;
        monday = addDays(monday, 7)
      ) {
        out.push({
          start: monday,
          label: String(parseYYYYMMDD(monday).getDate()),
        });
      }
      return out;
    }
    case "MONTHLY":
      return ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"].map(
        (label, i) => ({
          start: toKey(new Date(d.getFullYear(), i, 1)),
          label,
        }),
      );
    case "YEARLY":
      return [];
  }
}
