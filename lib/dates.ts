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
