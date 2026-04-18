export const ActivityType = {
  TASK: "TASK",
  EVENT: "EVENT",
  TRACKABLE: "TRACKABLE",
} as const;
export type ActivityType = (typeof ActivityType)[keyof typeof ActivityType];

export const BudgetType = {
  ACTUAL: "ACTUAL",
  BUDGETED: "BUDGETED",
} as const;
export type BudgetType = (typeof BudgetType)[keyof typeof BudgetType];

export const TrackableType = {
  NUMBER: "NUMBER",
  TIME_TRACK: "TIME_TRACK",
  DAYS_A_WEEK: "DAYS_A_WEEK",
  MINUTES_A_WEEK: "MINUTES_A_WEEK",
  TRACKER: "TRACKER",
} as const;
export type TrackableType = (typeof TrackableType)[keyof typeof TrackableType];

export const TrackableFrequencyType = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
} as const;
export type TrackableFrequencyType =
  (typeof TrackableFrequencyType)[keyof typeof TrackableFrequencyType];

export const ReviewFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
} as const;
export type ReviewFrequency =
  (typeof ReviewFrequency)[keyof typeof ReviewFrequency];

export const SharePermission = {
  VIEWER: "VIEWER",
  EDITOR: "EDITOR",
} as const;
export type SharePermission =
  (typeof SharePermission)[keyof typeof SharePermission];

export const ShareStatus = {
  PENDING: "PENDING",
  ACCEPTED: "ACCEPTED",
  REJECTED: "REJECTED",
} as const;
export type ShareStatus = (typeof ShareStatus)[keyof typeof ShareStatus];

export const RecurrenceFrequency = {
  DAILY: "DAILY",
  WEEKLY: "WEEKLY",
  MONTHLY: "MONTHLY",
  YEARLY: "YEARLY",
} as const;
export type RecurrenceFrequency =
  (typeof RecurrenceFrequency)[keyof typeof RecurrenceFrequency];
