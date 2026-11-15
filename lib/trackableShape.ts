/**
 * What a trackable measures and, optionally, the goal set on it.
 *
 * A trackable used to be one of five fixed types, each with its own form,
 * card and maths. It is now two independent choices:
 *
 *   measure   time | count | days | number
 *   goal      at least / at most an amount, per day, week or month, or in
 *             total (by the trackable's end date). Optional.
 *
 * Every combination is computed the same way from the same per-day facts
 * (`convex/trackableProgress.ts`), so there is one form and one card.
 *
 * The five old types are still stored (`trackableType` and its flags) for
 * the screens that have not moved over; `legacyFieldsFor` picks the
 * closest one, and `shapeOf` reads a trackable saved before `measure`
 * existed.
 *
 * Pure functions only: shared by the app and the backend.
 */

export type TrackableMeasure = "time" | "count" | "days" | "number";
export type GoalPeriod = "day" | "week" | "month" | "total";
export type GoalDirection = "atLeast" | "atMost";

export interface TrackableGoal {
  direction: GoalDirection;
  /** Hours when the measure is time; a plain number otherwise. */
  amount: number;
  period: GoalPeriod;
}

export interface TrackableShape {
  measure: TrackableMeasure;
  goal: TrackableGoal | null;
}

export const MEASURES: {
  key: TrackableMeasure;
  label: string;
  hint: string;
}[] = [
  { key: "time", label: "Time", hint: "Hours spent on what counts" },
  { key: "count", label: "Times done", hint: "Completed tasks and check-ins" },
  { key: "days", label: "Days active", hint: "Days with anything that counts" },
  { key: "number", label: "A number I log", hint: "Weight, pages, a rating" },
];

export const PERIODS: { key: GoalPeriod; label: string; noun: string }[] = [
  { key: "day", label: "per day", noun: "Today" },
  { key: "week", label: "per week", noun: "This week" },
  { key: "month", label: "per month", noun: "This month" },
  { key: "total", label: "in total", noun: "Total" },
];

export function unitLabel(measure: TrackableMeasure, amount = 2): string {
  const one = amount === 1;
  switch (measure) {
    case "time":
      return one ? "hour" : "hours";
    case "count":
      return one ? "time" : "times";
    case "days":
      return one ? "day" : "days";
    case "number":
      return "";
  }
}

type LegacyType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

export interface LegacyTrackableFields {
  trackableType: LegacyType;
  frequency?: "DAILY" | "WEEKLY" | "MONTHLY";
  targetNumberOfHours?: number;
  targetNumberOfDaysAWeek?: number;
  targetNumberOfMinutesAWeek?: number;
  targetCount?: number;
  trackTime: boolean;
  trackCount: boolean;
  autoCountFromCalendar: boolean;
}

/** The closest old type for a shape, for screens still keyed on it. */
export function legacyFieldsFor(shape: TrackableShape): LegacyTrackableFields {
  const { measure, goal } = shape;
  const atLeast = goal?.direction === "atLeast" ? goal : null;
  const tracker = (
    trackTime: boolean,
    trackCount: boolean,
    autoCountFromCalendar: boolean,
  ): LegacyTrackableFields => ({
    trackableType: "TRACKER",
    targetNumberOfHours: undefined,
    targetNumberOfDaysAWeek: undefined,
    targetNumberOfMinutesAWeek: undefined,
    targetCount: undefined,
    trackTime,
    trackCount,
    autoCountFromCalendar,
  });
  const goalType = (
    trackableType: LegacyType,
    targets: Partial<LegacyTrackableFields>,
  ): LegacyTrackableFields => ({
    ...tracker(true, true, true),
    trackableType,
    ...targets,
  });

  if (measure === "time") {
    if (atLeast?.period === "week") {
      return goalType("MINUTES_A_WEEK", {
        frequency: "WEEKLY",
        targetNumberOfMinutesAWeek: Math.round(atLeast.amount * 60),
      });
    }
    if (atLeast?.period === "total") {
      return goalType("TIME_TRACK", { targetNumberOfHours: atLeast.amount });
    }
    return tracker(true, false, true);
  }
  if (measure === "count") {
    if (atLeast?.period === "total") {
      return goalType("NUMBER", { targetCount: atLeast.amount });
    }
    return tracker(false, true, true);
  }
  if (measure === "days") {
    if (atLeast?.period === "week") {
      return goalType("DAYS_A_WEEK", {
        frequency: "WEEKLY",
        targetNumberOfDaysAWeek: atLeast.amount,
      });
    }
    return tracker(false, true, true);
  }
  return tracker(false, true, false);
}

/**
 * Which kinds of thing a "times done" or "days active" trackable counts
 * ("Of those, count" on its form). Before the setting existed, times done
 * counted completed tasks only, and a day was active with either.
 */
export function countsOf(t: {
  measure?: TrackableMeasure;
  trackableType: LegacyType;
  trackCount?: boolean;
  countEvents?: boolean;
  countTasks?: boolean;
}): { events: boolean; tasks: boolean } {
  return {
    events: t.countEvents ?? shapeOf(t).measure === "days",
    tasks: t.countTasks ?? true,
  };
}

type StoredTrackable = {
  measure?: TrackableMeasure;
  goal?: TrackableGoal;
  trackableType: LegacyType;
  targetNumberOfHours?: number;
  targetNumberOfDaysAWeek?: number;
  targetNumberOfMinutesAWeek?: number;
  targetCount?: number;
  trackCount?: boolean;
};

/** A trackable's measure and goal, read from the old type when needed. */
export function shapeOf(t: StoredTrackable): TrackableShape {
  if (t.measure) return { measure: t.measure, goal: t.goal ?? null };
  const atLeast = (
    amount: number | undefined,
    period: GoalPeriod,
  ): TrackableGoal | null =>
    amount && amount > 0 ? { direction: "atLeast", amount, period } : null;
  switch (t.trackableType) {
    case "NUMBER":
      return { measure: "count", goal: atLeast(t.targetCount, "total") };
    case "TIME_TRACK":
      return { measure: "time", goal: atLeast(t.targetNumberOfHours, "total") };
    case "DAYS_A_WEEK":
      return {
        measure: "days",
        goal: atLeast(t.targetNumberOfDaysAWeek, "week"),
      };
    case "MINUTES_A_WEEK":
      return {
        measure: "time",
        goal: atLeast(
          t.targetNumberOfMinutesAWeek
            ? t.targetNumberOfMinutesAWeek / 60
            : undefined,
          "week",
        ),
      };
    case "TRACKER":
      return { measure: t.trackCount === false ? "time" : "number", goal: null };
  }
}

/* ── Periods ──────────────────────────────────────────────────────────── */

function parse(day: string): Date {
  return new Date(
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(4, 6)) - 1,
      Number(day.slice(6, 8)),
    ),
  );
}
function format(d: Date): string {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Compact YYYYMMDD `days` after `day`. */
export function shiftDay(day: string, days: number): string {
  const d = parse(day);
  d.setUTCDate(d.getUTCDate() + days);
  return format(d);
}

/** Monday..Sunday (compact YYYYMMDD) of the week containing `day`. */
export function weekOf(day: string): { start: string; end: string } {
  const d = parse(day);
  const start = shiftDay(day, -((d.getUTCDay() + 6) % 7));
  return { start, end: shiftDay(start, 6) };
}

/**
 * The stretch of days a goal period covers, for the period containing
 * `today`. A total runs from the trackable's start day to today.
 */
export function periodRange(
  period: GoalPeriod,
  today: string,
  startDay: string,
): { start: string; end: string } {
  switch (period) {
    case "day":
      return { start: today, end: today };
    case "week":
      return weekOf(today);
    case "month": {
      const d = parse(today);
      const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const last = new Date(
        Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
      );
      return { start: format(first), end: format(last) };
    }
    case "total":
      return { start: startDay <= today ? startDay : today, end: today };
  }
}

/* ── Values ───────────────────────────────────────────────────────────── */

/** One day's facts for a trackable, from every source that feeds it. */
export interface DayFacts {
  /** Seconds of time that counted (events, timers, logged time). */
  seconds: number;
  /**
   * Things done that day: manual check-ins and logged counts, plus the
   * completed tasks and events the trackable is set to count.
   */
  count: number;
  /** Values logged by hand that day (for the "number" measure). */
  values: number[];
}

export const EMPTY_DAY: DayFacts = { seconds: 0, count: 0, values: [] };

/**
 * The measure's value over a set of days. Time is in seconds. A number
 * is the sum of what was logged, or the average when `cumulative` is
 * false (a rating, a weight).
 */
export function measureValue(
  measure: TrackableMeasure,
  days: readonly DayFacts[],
  cumulative = true,
): number {
  switch (measure) {
    case "time":
      return days.reduce((s, d) => s + d.seconds, 0);
    case "count":
      return days.reduce((s, d) => s + d.count, 0);
    case "days":
      return days.filter((d) => d.count > 0).length;
    case "number": {
      const values = days.flatMap((d) => d.values);
      if (values.length === 0) return 0;
      const sum = values.reduce((s, v) => s + v, 0);
      return cumulative ? sum : sum / values.length;
    }
  }
}

/** A goal's amount in the unit `measureValue` returns (seconds for time). */
export function goalTarget(measure: TrackableMeasure, goal: TrackableGoal): number {
  return measure === "time" ? goal.amount * 3600 : goal.amount;
}

export type GoalStatus = "met" | "onTrack" | "over";

/**
 * Where a value stands against a goal: an "at least" goal is met once the
 * value reaches it; an "at most" goal is on track until the value passes
 * it.
 */
export function goalStatus(
  measure: TrackableMeasure,
  goal: TrackableGoal,
  value: number,
): GoalStatus {
  const target = goalTarget(measure, goal);
  if (goal.direction === "atLeast") return value >= target ? "met" : "onTrack";
  return value > target ? "over" : "onTrack";
}

/** "4.5h", "45m", "3", "7.2": a value as it is shown. */
export function formatMeasure(measure: TrackableMeasure, value: number): string {
  if (measure === "time") {
    if (value > 0 && value < 3600) return `${Math.round(value / 60)}m`;
    const h = Math.round((value / 3600) * 10) / 10;
    return `${String(h).replace(/\.0$/, "")}h`;
  }
  const r = Math.round(value * 10) / 10;
  return String(r).replace(/\.0$/, "");
}

/** "At least 3 hours per week". */
export function describeGoal(measure: TrackableMeasure, goal: TrackableGoal): string {
  const period = PERIODS.find((p) => p.key === goal.period)!.label;
  const unit = unitLabel(measure, goal.amount);
  // 100 minutes a week is stored as 1.666… hours.
  const amount = Math.round(goal.amount * 100) / 100;
  return `${goal.direction === "atLeast" ? "At least" : "At most"} ${amount}${unit ? ` ${unit}` : ""} ${period}`;
}
