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
  const start = parseYYYYMMDD(rule.startDateYYYYMMDD);
  const rStart = parseYYYYMMDD(rangeStart);
  const rEnd = parseYYYYMMDD(rangeEnd);
  const end = rule.endDateYYYYMMDD
    ? parseYYYYMMDD(rule.endDateYYYYMMDD)
    : rEnd;

  const effectiveEnd = end < rEnd ? end : rEnd;
  const cursor = new Date(start);

  const MAX_OCCURRENCES = 500;

  while (cursor <= effectiveEnd && occurrences.length < MAX_OCCURRENCES) {
    const dateStr = formatYYYYMMDD(cursor);

    if (cursor >= rStart && !deletedDates.has(dateStr)) {
      if (matchesRule(cursor, rule)) {
        occurrences.push(dateStr);
      }
    }

    advanceCursor(cursor, rule);
  }

  return occurrences;
}

function matchesRule(date: Date, rule: RecurrenceRule): boolean {
  const dayOfWeek = date.getDay();

  switch (rule.frequency) {
    case "DAILY":
      return true;
    case "WEEKLY":
      if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
        return rule.daysOfWeek.includes(dayOfWeek);
      }
      return true;
    case "MONTHLY":
      if (rule.monthlyPattern === "DAY_OF_MONTH") {
        return date.getDate() === (rule.dayOfMonth ?? 1);
      }
      if (rule.monthlyPattern === "DAY_OF_WEEK") {
        const weekOfMonth = Math.ceil(date.getDate() / 7);
        return (
          dayOfWeek === (rule.dayOfWeekMonthly ?? 0) &&
          weekOfMonth === (rule.weekOfMonth ?? 1)
        );
      }
      return date.getDate() === 1;
    case "YEARLY":
      return (
        date.getMonth() === (rule.monthOfYear ?? 0) &&
        date.getDate() === (rule.dayOfMonth ?? 1)
      );
    default:
      return false;
  }
}

function advanceCursor(cursor: Date, rule: RecurrenceRule): void {
  switch (rule.frequency) {
    case "DAILY":
      cursor.setDate(cursor.getDate() + rule.interval);
      break;
    case "WEEKLY":
      cursor.setDate(cursor.getDate() + 1);
      break;
    case "MONTHLY":
      cursor.setMonth(cursor.getMonth() + rule.interval);
      break;
    case "YEARLY":
      cursor.setFullYear(cursor.getFullYear() + rule.interval);
      break;
  }
}
