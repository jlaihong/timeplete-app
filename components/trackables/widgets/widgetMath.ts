import { daysBetweenYYYYMMDD, todayYYYYMMDD } from "../../../lib/dates";
import type { WidgetGoal } from "./types";

/**
 * Required-rate display modelled on productivity-one's `requiredRateDisplay`
 * computed inside `goal-widget.ts`. Returns the *single* most useful pacing
 * stat to show alongside `today` / `avg`:
 *   - "needed/day" while there's >1 day left and >1/day required
 *   - "needed/week" when daily rate is small
 *   - "remaining" when the goal is due today / overdue (last-day push)
 *   - null when the goal is already met or there is no target
 *
 * `currentValue` and `targetValue` are in the **display unit** (hours for
 * TIME_TRACK, count for NUMBER) so this helper is shared.
 */
export type RequiredRate =
  | { kind: "needed-per-day"; value: number; suffix: string }
  | { kind: "needed-per-week"; value: number; suffix: string }
  | { kind: "remaining"; value: number; suffix: string }
  | null;

export function computeRequiredRate(
  goal: Pick<WidgetGoal, "endDayYYYYMMDD">,
  currentValue: number,
  targetValue: number,
  unitSuffix: string,
  today: string = todayYYYYMMDD()
): RequiredRate {
  if (!targetValue || targetValue <= 0) return null;
  const remaining = targetValue - currentValue;
  if (remaining <= 0) return null;

  const daysLeft = daysBetweenYYYYMMDD(today, goal.endDayYYYYMMDD);
  if (daysLeft <= 0) {
    return { kind: "remaining", value: remaining, suffix: unitSuffix };
  }

  const perDay = remaining / daysLeft;
  if (perDay >= 1) {
    return { kind: "needed-per-day", value: perDay, suffix: unitSuffix };
  }

  const perWeek = perDay * 7;
  return { kind: "needed-per-week", value: perWeek, suffix: unitSuffix };
}

export function formatRate(value: number): string {
  if (!isFinite(value)) return "0";
  const rounded = Math.round(value * 10) / 10;
  return rounded.toFixed(1).replace(/\.0$/, "");
}

export function rateLabel(rate: NonNullable<RequiredRate>): string {
  switch (rate.kind) {
    case "needed-per-day":
      return `needed/day`;
    case "needed-per-week":
      return `needed/week`;
    case "remaining":
      return `remaining`;
  }
}

/** Whether a non-tracker goal has hit its lifetime target. */
export function isGoalCompleted(
  currentValue: number,
  targetValue: number
): boolean {
  if (!targetValue || targetValue <= 0) return false;
  return currentValue >= targetValue;
}
