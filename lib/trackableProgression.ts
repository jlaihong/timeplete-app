/**
 * Shaping a trackable's daily values for the Analytics "Trackable
 * Progression" card: bars for the chart, and how its goal fared over the
 * period on screen. Pure functions; the values come from
 * `trackableProgress.range`.
 */
import {
  goalTarget,
  shiftDay,
  weekOf,
  type GoalPeriod,
  type TrackableGoal,
  type TrackableMeasure,
} from "./trackableShape";

export type AnalyticsTab = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export interface DayValue {
  dayYYYYMMDD: string;
  value: number;
}

/**
 * Daily values → one value. Time, counts and active days add up; an
 * averaged number (a rating, a weight) is the mean of the days it has.
 */
function combine(values: number[], cumulative: boolean): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((s, v) => s + v, 0);
  return cumulative ? sum : sum / values.length;
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface Bar {
  key: string;
  label: string;
  value: number;
}

/**
 * The chart for a period: a bar per day for a week or a month, a bar per
 * month for a year, nothing for a single day.
 */
export function progressionBars(
  tab: AnalyticsTab,
  start: string,
  end: string,
  days: readonly DayValue[],
  cumulative = true,
): Bar[] {
  if (tab === "DAILY") return [];
  const byDay = new Map(days.map((d) => [d.dayYYYYMMDD, d.value]));
  if (tab === "YEARLY") {
    const bars: Bar[] = [];
    const year = start.slice(0, 4);
    const lastMonth = Number(end.slice(4, 6));
    for (let m = 1; m <= lastMonth; m++) {
      const prefix = `${year}${String(m).padStart(2, "0")}`;
      bars.push({
        key: prefix,
        label: MONTHS[m - 1],
        value: combine(
          days.filter((d) => d.dayYYYYMMDD.startsWith(prefix)).map((d) => d.value),
          cumulative,
        ),
      });
    }
    return bars;
  }
  const bars: Bar[] = [];
  for (let day = start; day <= end; day = shiftDay(day, 1)) {
    bars.push({
      key: day,
      label: String(Number(day.slice(6))),
      value: byDay.get(day) ?? 0,
    });
  }
  return bars;
}

export interface GoalOutcome {
  /** The goal's own period: "day", "week" or "month". */
  period: Exclude<GoalPeriod, "total">;
  /** How many of those periods fall in the range (and have started). */
  of: number;
  /** How many of them met the goal. */
  met: number;
  /** With exactly one period: its value, to show against the target. */
  value: number | null;
  target: number;
}

/**
 * How a goal fared over a range: the range is cut into the goal's own
 * periods (days, Monday-to-Sunday weeks, months) and each is checked.
 * A week or month belongs to the range it starts in. Periods that have
 * not started yet are left out. `null` for a goal "in total".
 */
export function goalOutcome(
  measure: TrackableMeasure,
  goal: TrackableGoal,
  start: string,
  end: string,
  days: readonly DayValue[],
  today: string,
  cumulative = true,
): GoalOutcome | null {
  if (goal.period === "total") return null;
  const target = goalTarget(measure, goal);
  const last = end < today ? end : today;

  const buckets = new Map<string, number[]>();
  const keyOf = (day: string) =>
    goal.period === "day"
      ? day
      : goal.period === "week"
        ? weekOf(day).start
        : day.slice(0, 6);
  for (let day = start; day <= last; day = shiftDay(day, 1)) {
    const key = keyOf(day);
    // A week belongs to the range its Monday is in.
    if (goal.period === "week" && key < start) continue;
    if (!buckets.has(key)) buckets.set(key, []);
  }
  for (const d of days) {
    const bucket = buckets.get(keyOf(d.dayYYYYMMDD));
    if (bucket && d.dayYYYYMMDD <= last) bucket.push(d.value);
  }

  let met = 0;
  let only: number | null = null;
  for (const values of buckets.values()) {
    const value = combine(values, cumulative);
    only = value;
    if (goal.direction === "atLeast" ? value >= target : value <= target) {
      met += 1;
    }
  }
  return {
    period: goal.period,
    of: buckets.size,
    met,
    value: buckets.size === 1 ? only : null,
    target,
  };
}
