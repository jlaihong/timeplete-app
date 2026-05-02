import { daysBetweenYYYYMMDD } from "./dates";
import type { TrackableSeriesGoal } from "../components/analytics/widgets/types";

/* ──────────────────────────────────────────────────────────────────── *
 * Required-progress math — direct port of productivity-one's
 * `src/app/utils/required-progress.utils.ts`. Owns two questions:
 *
 *   1. What's the *effective cumulative target* for this trackable?
 *      For per-week-target trackables (DAYS_A_WEEK / MINUTES_A_WEEK)
 *      the *analytics* cumulative target is still `weekly × committedWeeks`
 *      (see `getPeriodicCommittedWeekCount`). The *home widget* "Overall"
 *      bar in productivity-one uses a **week scale**: denominator =
 *      `targetNumberOfWeeks`; numerator = count of **successful** weeks
 *      (weekly target met; `periodicDiff` / minute-threshold logic). Convex
 *      mirrors that as `periodicOverallProgress = succeededWeeks × weekly`, so
 *      UIs still compute `periodicOverallProgress / weekly` for the numerator.
 *
 *   2. At a given date `d`, what value should the cumulative actual
 *      have reached if the user is exactly on pace? Linear:
 *      `target × completedDays / totalDaysInclusive`, where
 *      `completedDays = clamp(daysFromGoalStart(d) + 1, 0, totalDays)`.
 *
 * Both helpers are pure / framework-free so they can be unit-tested
 * (and reused by yearly month-aligned series — see
 * `buildYearlyAlignedRequiredProgressPoints`).
 * ──────────────────────────────────────────────────────────────────── */

export interface RequiredProgressPoint {
  /** Bucket index (matches the actual series x-position). */
  x: number;
  y: number;
}

function suggestedGracePeriod(weeksBetween: number): number {
  if (weeksBetween <= 4) return 0;
  return Math.round(weeksBetween * 0.2);
}

/** Mirrors onboarding `CommitmentForms.suggestedWeeksWithGrace` / productivity-one. */
export function suggestedWeeksWithGrace(weeksBetween: number): number {
  if (weeksBetween <= 0) return 0;
  if (weeksBetween === 1) return 1;
  return Math.max(1, weeksBetween - suggestedGracePeriod(weeksBetween));
}

interface EffectiveTargetGoal {
  trackableType: TrackableSeriesGoal["trackableType"];
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  targetNumberOfDaysAWeek?: number;
  targetNumberOfMinutesAWeek?: number;
  /** When set, lifetime target is `weekly × weeks` (matches edit UI). */
  targetNumberOfWeeks?: number;
  targetCount?: number;
  targetNumberOfHours?: number;
}

/**
 * Committed week count for periodic goals — same base used for analytics
 * cumulative targets and for the home widget overall bar *denominator*.
 */
export function getPeriodicCommittedWeekCount(
  goal: Pick<
    EffectiveTargetGoal,
    "trackableType" | "startDayYYYYMMDD" | "endDayYYYYMMDD" | "targetNumberOfWeeks"
  >,
): number {
  if (
    goal.trackableType !== "DAYS_A_WEEK" &&
    goal.trackableType !== "MINUTES_A_WEEK"
  ) {
    return 0;
  }
  const weeksFloor = Math.floor(
    daysBetweenYYYYMMDD(goal.startDayYYYYMMDD, goal.endDayYYYYMMDD) / 7,
  );
  const committed =
    goal.targetNumberOfWeeks != null && goal.targetNumberOfWeeks > 0
      ? goal.targetNumberOfWeeks
      : suggestedWeeksWithGrace(weeksFloor > 0 ? weeksFloor : 1);
  return committed > 0 ? committed : 0;
}

/**
 * Effective lifetime target the cumulative line chases. Returns 0
 * when there's no usable target so callers can simply skip drawing.
 */
export function getEffectiveCumulativeTarget(
  goal: EffectiveTargetGoal,
): number {
  if (goal.trackableType === "DAYS_A_WEEK") {
    const weekly = goal.targetNumberOfDaysAWeek ?? 0;
    if (weekly <= 0) return 0;
    const weeks = getPeriodicCommittedWeekCount(goal);
    if (weeks <= 0) return 0;
    return weekly * weeks;
  }
  if (goal.trackableType === "MINUTES_A_WEEK") {
    const weekly = goal.targetNumberOfMinutesAWeek ?? 0;
    if (weekly <= 0) return 0;
    const weeks = getPeriodicCommittedWeekCount(goal);
    if (weeks <= 0) return 0;
    return weekly * weeks;
  }
  if (goal.trackableType === "NUMBER") return goal.targetCount ?? 0;
  if (goal.trackableType === "TIME_TRACK") return goal.targetNumberOfHours ?? 0;
  // TRACKER: caller decides which target to feed in (count vs hours).
  return 0;
}

/**
 * One required-progress point per `periodDate`. Mirrors P1's
 * `computeRequiredProgressPoints`. The `periodDates` array drives the
 * x-positions — pass the list of YYYYMMDD bucket dates the actual
 * series uses so the two charts line up tick-for-tick.
 */
export function computeRequiredProgressPoints(
  goalStartDay: string,
  goalEndDay: string,
  effectiveTarget: number,
  periodDates: string[],
  options?: { includeBasePoint?: boolean },
): RequiredProgressPoint[] {
  if (effectiveTarget <= 0 || periodDates.length === 0) return [];
  const totalDaysInclusive = totalDaysInclusiveOf(goalStartDay, goalEndDay);
  if (totalDaysInclusive <= 0) return [];

  const requiredAtDay = (date: string): number => {
    const daysFromStart = daysBetweenYYYYMMDD(goalStartDay, date);
    const completedDays = Math.max(
      0,
      Math.min(totalDaysInclusive, daysFromStart + 1),
    );
    return (
      Math.round(((effectiveTarget * completedDays) / totalDaysInclusive) * 10) /
      10
    );
  };

  const points: RequiredProgressPoint[] = [];
  // Optional "starting baseline" tick at x=0 with the value the
  // line *had* at the previous day. P1 uses this so the dashed
  // line starts flush with whatever cumulative actuals carried over
  // from before the visible window.
  let xStart = 0;
  if (options?.includeBasePoint) {
    const dayBefore = addDaysSimple(periodDates[0], -1);
    points.push({ x: 0, y: requiredAtDay(dayBefore) });
    xStart = 1;
  }
  for (let i = 0; i < periodDates.length; i++) {
    points.push({
      x: options?.includeBasePoint ? xStart + i : i,
      y: requiredAtDay(periodDates[i]),
    });
  }
  return points;
}

/**
 * Yearly view variant — evaluates the required-progress formula at
 * each month-start date and pins the result to that month's bucket
 * x-position. Mirrors P1's `buildYearlyAlignedRequiredProgressPoints`.
 *
 * `monthStartDates[i]` is the YYYYMMDD of the first day of bucket
 * `i`'s month. The result has one point per month bucket.
 */
export function buildYearlyAlignedRequiredProgressPoints(
  goalStartDay: string,
  goalEndDay: string,
  effectiveTarget: number,
  monthStartDates: string[],
): RequiredProgressPoint[] {
  if (effectiveTarget <= 0 || monthStartDates.length === 0) return [];
  const totalDaysInclusive = totalDaysInclusiveOf(goalStartDay, goalEndDay);
  if (totalDaysInclusive <= 0) return [];

  return monthStartDates.map((date, i) => {
    const daysFromStart = daysBetweenYYYYMMDD(goalStartDay, date);
    const completedDays = Math.max(
      0,
      Math.min(totalDaysInclusive, daysFromStart + 1),
    );
    return {
      x: i,
      y:
        Math.round(
          ((effectiveTarget * completedDays) / totalDaysInclusive) * 10,
        ) / 10,
    };
  });
}

/* ──────────────── small public helpers used by widgets ──────────────── */

/**
 * Running sum starting from `baseline`. Used by the cumulative branch
 * of weekly / monthly / yearly line charts so the curve picks up where
 * `totalBeforePeriod` left off.
 */
export function accumulate(values: number[], baseline: number): number[] {
  let acc = baseline;
  return values.map((v) => {
    acc += v;
    return Math.round(acc * 100) / 100;
  });
}

/**
 * Picks the right "effective cumulative target" for a TRACKER's
 * count or time dimension. P1 stores TRACKER targets as plain
 * `targetCount` / `targetNumberOfHours` and the cumulative line is
 * gated on `isCumulative` AND target > 0 (see P1
 * `analytics-weekly-tracker-widget.ts:170-194`).
 */
export function getTrackerCumulativeTarget(
  goal: { targetCount?: number; targetNumberOfHours?: number },
  dimension: "count" | "hours",
): number {
  if (dimension === "count") return goal.targetCount ?? 0;
  return goal.targetNumberOfHours ?? 0;
}

/* ──────────────── internal helpers ──────────────── */

function totalDaysInclusiveOf(start: string, end: string): number {
  if (!start || !end) return 0;
  return Math.max(1, daysBetweenYYYYMMDD(start, end) + 1);
}

/**
 * Tiny YYYYMMDD ± N days helper. We can't import `addDays` from
 * `lib/dates.ts` here without a circular module concern in some
 * bundlers (this file is also imported by Convex client code), so
 * we inline a minimal version. Same semantics.
 */
function addDaysSimple(yyyymmdd: string, delta: number): string {
  const y = parseInt(yyyymmdd.slice(0, 4), 10);
  const m = parseInt(yyyymmdd.slice(4, 6), 10) - 1;
  const d = parseInt(yyyymmdd.slice(6, 8), 10);
  const date = new Date(y, m, d);
  date.setDate(date.getDate() + delta);
  const yy = date.getFullYear().toString();
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yy}${mm}${dd}`;
}
