/**
 * Helpers aligned with productivity-one `review-component` / `reflect-dialog`
 * (`getReflectMeta`, `displayQuestions`, `getChildDateLabel`).
 */

import {
  addDays,
  endOfMonth,
  endOfYear,
  formatYYYYMMDDtoWeekdayDayMonth,
  getMonthYearCompact,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "./dates";

export type ReviewFrequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

export function displayReviewQuestions<
  T extends { _id: string; archived: boolean; orderIndex: number },
>(questions: T[] | undefined, currentAnswers: { reviewQuestionId: string }[]): T[] {
  if (!questions) return [];
  const active = questions.filter((q) => !q.archived);
  const archived = questions.filter((q) => q.archived);
  const answeredIds = new Set(currentAnswers.map((a) => a.reviewQuestionId));
  const archivedWithAnswers = archived.filter((q) => answeredIds.has(q._id));
  return [...active, ...archivedWithAnswers].sort(
    (a, b) => a.orderIndex - b.orderIndex
  );
}

export function getReflectMeta(
  freq: Exclude<ReviewFrequency, "DAILY">,
  canonicalDate: string
): {
  childFrequency: "DAILY" | "WEEKLY" | "MONTHLY";
  childLabel: string;
  currentLabel: string;
  startDate: string;
  endDate: string;
} {
  if (freq === "WEEKLY") {
    const monday = startOfWeek(canonicalDate);
    return {
      childFrequency: "DAILY",
      childLabel: "Daily",
      currentLabel: "Weekly",
      startDate: monday,
      endDate: addDays(monday, 6),
    };
  }
  if (freq === "MONTHLY") {
    return {
      childFrequency: "WEEKLY",
      childLabel: "Weekly",
      currentLabel: "Monthly",
      startDate: startOfMonth(canonicalDate),
      endDate: endOfMonth(canonicalDate),
    };
  }
  return {
    childFrequency: "MONTHLY",
    childLabel: "Monthly",
    currentLabel: "Yearly",
    startDate: startOfYear(canonicalDate),
    endDate: endOfYear(canonicalDate),
  };
}

export function getChildDateLabel(
  childFrequency: "DAILY" | "WEEKLY" | "MONTHLY",
  date: string
): string {
  if (childFrequency === "DAILY") {
    return formatYYYYMMDDtoWeekdayDayMonth(date);
  }
  if (childFrequency === "WEEKLY") {
    const monday = startOfWeek(date);
    return `Week of ${formatYYYYMMDDtoWeekdayDayMonth(monday)}`;
  }
  return getMonthYearCompact(date);
}
