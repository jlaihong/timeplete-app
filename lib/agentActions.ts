/**
 * Agent API catalog and input parsing. Shared by the Convex handlers,
 * the Agent access screen, and unit tests. No database access.
 */

import { startOfMonth, startOfWeek, startOfYear } from "./dates";
import { wallClockInTimeZone } from "./wallClockTimeZone";

export const AGENT_ACTION_NAMES = [
  "list_lists",
  "search_tasks",
  "create_task",
  "list_events",
  "create_event",
  "reschedule_event",
  "read_reviews",
  "write_reviews",
  "add_to_calendar",
  "complete_task",
] as const;

export type AgentActionName = (typeof AGENT_ACTION_NAMES)[number];

export type AgentActionSpec = {
  name: AgentActionName;
  label: string;
  description: string;
  /** Field name to a short description of what the agent should send. */
  input: Record<string, string>;
};

export const AGENT_ACTIONS: readonly AgentActionSpec[] = [
  {
    name: "list_lists",
    label: "List lists",
    description: "Read the names of your lists.",
    input: {},
  },
  {
    name: "search_tasks",
    label: "Search tasks",
    description: "Find tasks by name, list, or day.",
    input: {
      name: "Optional. Case-insensitive substring of the task name.",
      list: "Optional list name.",
      day: "Optional date, YYYY-MM-DD. Limits the search to that day.",
      includeCompleted: "Optional boolean. Defaults to false.",
    },
  },
  {
    name: "create_task",
    label: "Create tasks",
    description: "Add a task to a list, optionally on a day.",
    input: {
      name: "Required task name.",
      list: "Optional list name. Defaults to Inbox.",
      day: "Optional date, YYYY-MM-DD. The day the task shows on.",
      dueDate: "Optional due date, YYYY-MM-DD.",
    },
  },
  {
    name: "list_events",
    label: "List calendar events",
    description: "Read events between two dates, at most 31 days apart.",
    input: {
      startDay: "Required date, YYYY-MM-DD.",
      endDay: "Required date, YYYY-MM-DD.",
    },
  },
  {
    name: "create_event",
    label: "Add calendar events",
    description: "Put a new event on the calendar.",
    input: {
      title: "Required event title.",
      day: "Required date, YYYY-MM-DD.",
      startTime: "Required start time, 24-hour HH:MM or 3:00pm.",
      durationMinutes: "Optional length in minutes. Defaults to 60. Minimum 5.",
      timeZone: "Optional IANA time zone. Defaults to UTC.",
      useTimeZone:
        "Optional boolean. When true, the start time is in timeZone. When false or omitted, the start time is a floating wall-clock time.",
    },
  },
  {
    name: "reschedule_event",
    label: "Change event times",
    description:
      "Move an event to a new day or time. Pass eventId, or title plus day.",
    input: {
      eventId: "Optional id from list_events. Required when title is omitted.",
      title: "Optional exact event title. Required when eventId is omitted.",
      day: "Current event date, YYYY-MM-DD. Required when matching by title.",
      newDay: "Optional new date, YYYY-MM-DD.",
      newStartTime: "Optional new start time.",
      durationMinutes: "Optional new length in minutes. Minimum 5.",
      occurrence:
        'Optional "this" (default) or "series". Series changes the time of this and later occurrences that still follow the series. Series cannot move to a different day.',
    },
  },
  {
    name: "read_reviews",
    label: "Read reviews",
    description:
      "Read the questions and answers for one daily, weekly, monthly, or yearly review.",
    input: {
      frequency: 'Required. "daily", "weekly", "monthly", or "yearly".',
      day: "Required date inside that period, YYYY-MM-DD. A week starts on Monday, a month on the 1st, and a year on January 1.",
    },
  },
  {
    name: "write_reviews",
    label: "Write reviews",
    description:
      "Save answers for one daily, weekly, monthly, or yearly review.",
    input: {
      frequency: 'Required. "daily", "weekly", "monthly", or "yearly".',
      day: "Required date inside that period, YYYY-MM-DD.",
      answers:
        "Required list of { question, answer }. question matches the question text. answer is the text to save. An empty answer clears it.",
    },
  },
  {
    name: "add_to_calendar",
    label: "Add to calendar",
    description:
      "Put an existing task on the calendar at a start and end time, the same as dragging it onto the calendar.",
    input: {
      taskId: "Optional id from search_tasks. Required when name is omitted.",
      name: "Optional task name. Required when taskId is omitted.",
      list: "Optional list name. Narrows the search when several tasks share a name.",
      taskDay:
        "Optional day the task is already on, YYYY-MM-DD. Narrows the search. This is not the calendar day.",
      day: "Required calendar date, YYYY-MM-DD.",
      startTime: "Required start time, 24-hour HH:MM or 3:00pm.",
      endTime:
        "Optional end time on the same day. When omitted, durationMinutes is used, or the task estimate, or 30 minutes.",
      durationMinutes:
        "Optional length in minutes. Minimum 5. Ignored when endTime is set.",
      timeZone:
        "Optional IANA time zone stored on the block. The time stays a floating wall-clock time. Defaults to UTC.",
    },
  },
  {
    name: "complete_task",
    label: "Complete tasks",
    description:
      "Mark an existing task complete, or mark it incomplete again.",
    input: {
      taskId: "Optional id from search_tasks. Required when name is omitted.",
      name: "Optional task name. Required when taskId is omitted.",
      list: "Optional list name. Narrows the search when several tasks share a name.",
      day: "Optional current scheduled date, YYYY-MM-DD. Narrows the search.",
      completed:
        "Optional boolean. True marks it complete. False clears completion. Defaults to true.",
      completedOn:
        "Optional completion date, YYYY-MM-DD. Used when completed is true. Defaults to today in timeZone.",
      timeZone:
        "Optional IANA time zone used only when completedOn is omitted. Defaults to UTC.",
    },
  },
];

const ACTION_SET = new Set<string>(AGENT_ACTION_NAMES);

export function isAgentAction(value: string): value is AgentActionName {
  return ACTION_SET.has(value);
}

export function actionSpec(name: AgentActionName): AgentActionSpec {
  const spec = AGENT_ACTIONS.find((action) => action.name === name);
  if (!spec) throw new Error(`Missing agent action spec: ${name}`);
  return spec;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; message: string };

export function normalizeScopes(
  scopes: readonly string[],
): ParseResult<AgentActionName[]> {
  if (scopes.length === 0) {
    return { ok: false, message: "Choose at least one action." };
  }
  const out: AgentActionName[] = [];
  for (const scope of scopes) {
    if (!isAgentAction(scope)) {
      return { ok: false, message: `Unknown action: ${scope}` };
    }
    if (!out.includes(scope)) out.push(scope);
  }
  return { ok: true, value: out };
}

export function normalizeKeyName(name: string): ParseResult<string> {
  const trimmed = name.trim();
  if (!trimmed) {
    return { ok: false, message: "Name the key so you can tell agents apart." };
  }
  if (trimmed.length > 60) {
    return { ok: false, message: "Key name must be 60 characters or fewer." };
  }
  return { ok: true, value: trimmed };
}

const GROCERY_ALIASES = ["grocery", "groceries", "grocery list"];

export type AgentListChoice<T> =
  | { status: "match"; list: T }
  | { status: "none" }
  | { status: "ambiguous"; names: string[] };

export function resolveAgentList<
  T extends { name: string; archived?: boolean; isInbox?: boolean },
>(lists: readonly T[], hint: string): AgentListChoice<T> {
  const q = hint.trim().toLowerCase();
  if (!q) return { status: "none" };
  const active = lists.filter((list) => !list.archived);

  if (q === "inbox") {
    const inboxes = active.filter((list) => list.isInbox);
    if (inboxes.length === 1) return { status: "match", list: inboxes[0] };
  }

  const aliases = GROCERY_ALIASES.includes(q) ? GROCERY_ALIASES : [q];
  const exact = active.filter((list) =>
    aliases.includes(list.name.trim().toLowerCase()),
  );
  if (exact.length === 1) return { status: "match", list: exact[0] };
  if (exact.length > 1) {
    return { status: "ambiguous", names: exact.map((list) => list.name) };
  }

  if (q.length < 3) return { status: "none" };
  const partial = active.filter((list) =>
    aliases.some((alias) => list.name.trim().toLowerCase().includes(alias)),
  );
  if (partial.length === 1) return { status: "match", list: partial[0] };
  if (partial.length > 1) {
    return { status: "ambiguous", names: partial.map((list) => list.name) };
  }
  return { status: "none" };
}

export function compactDay(input: string): string | null {
  const trimmed = input.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const compact = iso ? `${iso[1]}${iso[2]}${iso[3]}` : trimmed;
  if (!/^\d{8}$/.test(compact)) return null;
  const year = Number(compact.slice(0, 4));
  const month = Number(compact.slice(4, 6));
  const day = Number(compact.slice(6, 8));
  const utc = new Date(Date.UTC(year, month - 1, day));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month - 1 ||
    utc.getUTCDate() !== day
  ) {
    return null;
  }
  return compact;
}

export function formatDay(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

/** Whole days from start to end. Same day is 0. */
export function daySpan(start: string, end: string): number {
  const startMs = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(4, 6)) - 1,
    Number(start.slice(6, 8)),
  );
  const endMs = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(4, 6)) - 1,
    Number(end.slice(6, 8)),
  );
  return Math.round((endMs - startMs) / 86_400_000);
}

export function parseHHMM(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  const ampm = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/.exec(trimmed);
  if (ampm) {
    let hour = Number(ampm[1]);
    const minute = ampm[2] === undefined ? 0 : Number(ampm[2]);
    if (hour < 1 || hour > 12 || minute > 59) return null;
    if (ampm[3] === "am") hour = hour === 12 ? 0 : hour;
    else hour = hour === 12 ? 12 : hour + 12;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }
  const clock = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!clock) return null;
  const hour = Number(clock[1]);
  const minute = Number(clock[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function asInputRecord(
  input: unknown,
): ParseResult<Record<string, unknown>> {
  if (input === undefined || input === null) return { ok: true, value: {} };
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, message: "input must be an object." };
  }
  return { ok: true, value: input as Record<string, unknown> };
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): ParseResult<string | undefined> {
  if (!(key in input) || input[key] === undefined || input[key] === null) {
    return { ok: true, value: undefined };
  }
  if (typeof input[key] !== "string") {
    return { ok: false, message: `${key} must be a string.` };
  }
  const trimmed = input[key].trim();
  return { ok: true, value: trimmed.length > 0 ? trimmed : undefined };
}

function requiredString(
  input: Record<string, unknown>,
  key: string,
  maxLength: number,
): ParseResult<string> {
  const parsed = optionalString(input, key);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: false, message: `${key} is required.` };
  if (parsed.value.length > maxLength) {
    return {
      ok: false,
      message: `${key} must be ${maxLength} characters or fewer.`,
    };
  }
  return { ok: true, value: parsed.value };
}

function optionalDay(
  input: Record<string, unknown>,
  key: string,
): ParseResult<string | undefined> {
  const parsed = optionalString(input, key);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: true, value: undefined };
  const day = compactDay(parsed.value);
  if (!day) {
    return { ok: false, message: `${key} must be a date like 2026-11-03.` };
  }
  return { ok: true, value: day };
}

function requiredDay(
  input: Record<string, unknown>,
  key: string,
): ParseResult<string> {
  const parsed = optionalDay(input, key);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: false, message: `${key} is required.` };
  return { ok: true, value: parsed.value };
}

function optionalClock(
  input: Record<string, unknown>,
  key: string,
): ParseResult<string | undefined> {
  const parsed = optionalString(input, key);
  if (!parsed.ok) return parsed;
  if (!parsed.value) return { ok: true, value: undefined };
  const clock = parseHHMM(parsed.value);
  if (!clock) {
    return { ok: false, message: `${key} must be a time like 15:00 or 3:00pm.` };
  }
  return { ok: true, value: clock };
}

function optionalDuration(
  input: Record<string, unknown>,
  key: string,
): ParseResult<number | undefined> {
  if (!(key in input) || input[key] === undefined || input[key] === null) {
    return { ok: true, value: undefined };
  }
  const raw = input[key];
  const value =
    typeof raw === "number"
      ? raw
      : typeof raw === "string" && raw.trim() !== ""
        ? Number(raw)
        : NaN;
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { ok: false, message: `${key} must be a whole number of minutes.` };
  }
  if (value < 5 || value > 24 * 60) {
    return {
      ok: false,
      message: `${key} must be between 5 and 1440 minutes.`,
    };
  }
  return { ok: true, value };
}

function optionalBoolean(
  input: Record<string, unknown>,
  key: string,
): ParseResult<boolean | undefined> {
  if (!(key in input) || input[key] === undefined || input[key] === null) {
    return { ok: true, value: undefined };
  }
  if (typeof input[key] !== "boolean") {
    return { ok: false, message: `${key} must be true or false.` };
  }
  return { ok: true, value: input[key] };
}

export type CreateTaskInput = {
  name: string;
  list?: string;
  day?: string;
  dueDate?: string;
};

export function parseCreateTaskInput(
  input: Record<string, unknown>,
): ParseResult<CreateTaskInput> {
  const name = requiredString(input, "name", 500);
  if (!name.ok) return name;
  const list = optionalString(input, "list");
  if (!list.ok) return list;
  const day = optionalDay(input, "day");
  if (!day.ok) return day;
  const dueDate = optionalDay(input, "dueDate");
  if (!dueDate.ok) return dueDate;
  return {
    ok: true,
    value: {
      name: name.value,
      list: list.value,
      day: day.value,
      dueDate: dueDate.value,
    },
  };
}

export type SearchTasksInput = {
  name?: string;
  list?: string;
  day?: string;
  includeCompleted: boolean;
};

export function parseSearchTasksInput(
  input: Record<string, unknown>,
): ParseResult<SearchTasksInput> {
  const name = optionalString(input, "name");
  if (!name.ok) return name;
  if (name.value && name.value.length > 200) {
    return { ok: false, message: "name must be 200 characters or fewer." };
  }
  const list = optionalString(input, "list");
  if (!list.ok) return list;
  const day = optionalDay(input, "day");
  if (!day.ok) return day;
  const includeCompleted = optionalBoolean(input, "includeCompleted");
  if (!includeCompleted.ok) return includeCompleted;
  return {
    ok: true,
    value: {
      name: name.value,
      list: list.value,
      day: day.value,
      includeCompleted: includeCompleted.value === true,
    },
  };
}

export type ListEventsInput = {
  startDay: string;
  endDay: string;
};

export function parseListEventsInput(
  input: Record<string, unknown>,
): ParseResult<ListEventsInput> {
  const startDay = requiredDay(input, "startDay");
  if (!startDay.ok) return startDay;
  const endDay = requiredDay(input, "endDay");
  if (!endDay.ok) return endDay;
  const span = daySpan(startDay.value, endDay.value);
  if (span < 0) return { ok: false, message: "endDay is before startDay." };
  if (span > 30) {
    return { ok: false, message: "Date range can be at most 31 days." };
  }
  return { ok: true, value: { startDay: startDay.value, endDay: endDay.value } };
}

export type CreateEventInput = {
  title: string;
  day: string;
  startTime: string;
  durationMinutes: number;
  timeZone: string;
  useTimeZone: boolean;
};

export function parseCreateEventInput(
  input: Record<string, unknown>,
): ParseResult<CreateEventInput> {
  const title = requiredString(input, "title", 200);
  if (!title.ok) return title;
  const day = requiredDay(input, "day");
  if (!day.ok) return day;
  const startTime = optionalClock(input, "startTime");
  if (!startTime.ok) return startTime;
  if (!startTime.value) return { ok: false, message: "startTime is required." };
  const durationMinutes = optionalDuration(input, "durationMinutes");
  if (!durationMinutes.ok) return durationMinutes;
  const timeZone = optionalString(input, "timeZone");
  if (!timeZone.ok) return timeZone;
  const zone = timeZone.value ?? "UTC";
  if (!isValidTimeZone(zone)) {
    return { ok: false, message: `Unknown time zone "${zone}".` };
  }
  const useTimeZone = optionalBoolean(input, "useTimeZone");
  if (!useTimeZone.ok) return useTimeZone;
  return {
    ok: true,
    value: {
      title: title.value,
      day: day.value,
      startTime: startTime.value,
      durationMinutes: durationMinutes.value ?? 60,
      timeZone: zone,
      useTimeZone: useTimeZone.value === true,
    },
  };
}

export type RescheduleInput = {
  eventId?: string;
  title?: string;
  day?: string;
  newDay?: string;
  newStartTime?: string;
  durationMinutes?: number;
  occurrence: "this" | "series";
};

export function parseRescheduleInput(
  input: Record<string, unknown>,
): ParseResult<RescheduleInput> {
  const eventId = optionalString(input, "eventId");
  if (!eventId.ok) return eventId;
  const title = optionalString(input, "title");
  if (!title.ok) return title;
  if (title.value && title.value.length > 200) {
    return { ok: false, message: "title must be 200 characters or fewer." };
  }
  const day = optionalDay(input, "day");
  if (!day.ok) return day;
  if (!eventId.value && !(title.value && day.value)) {
    return {
      ok: false,
      message: "Pass eventId, or both title and day, so the event can be found.",
    };
  }
  const newDay = optionalDay(input, "newDay");
  if (!newDay.ok) return newDay;
  const newStartTime = optionalClock(input, "newStartTime");
  if (!newStartTime.ok) return newStartTime;
  const durationMinutes = optionalDuration(input, "durationMinutes");
  if (!durationMinutes.ok) return durationMinutes;
  if (!newDay.value && !newStartTime.value && durationMinutes.value === undefined) {
    return {
      ok: false,
      message: "Pass newDay, newStartTime, or durationMinutes.",
    };
  }
  const occurrenceRaw = optionalString(input, "occurrence");
  if (!occurrenceRaw.ok) return occurrenceRaw;
  const occurrenceToken = (occurrenceRaw.value ?? "this").toLowerCase();
  const occurrence =
    occurrenceToken === "this" || occurrenceToken === "this_occurrence"
      ? "this"
      : occurrenceToken === "series"
        ? "series"
        : null;
  if (!occurrence) {
    return { ok: false, message: 'occurrence must be "this" or "series".' };
  }
  if (occurrence === "series" && newDay.value) {
    return {
      ok: false,
      message:
        'A series cannot move to a different day. Pass occurrence "this" to move one event, or omit newDay to change the series time.',
    };
  }
  return {
    ok: true,
    value: {
      eventId: eventId.value,
      title: title.value,
      day: day.value,
      newDay: newDay.value,
      newStartTime: newStartTime.value,
      durationMinutes: durationMinutes.value,
      occurrence,
    },
  };
}

export const REVIEW_FREQUENCIES = [
  "DAILY",
  "WEEKLY",
  "MONTHLY",
  "YEARLY",
] as const;

export type ReviewFrequency = (typeof REVIEW_FREQUENCIES)[number];

export function parseReviewFrequency(raw: string): ReviewFrequency | null {
  const token = raw.trim().toUpperCase();
  if (
    token === "DAILY" ||
    token === "WEEKLY" ||
    token === "MONTHLY" ||
    token === "YEARLY"
  ) {
    return token;
  }
  return null;
}

/** The date the review screen stores for a period that contains `day`. */
export function canonicalReviewDay(
  frequency: ReviewFrequency,
  day: string,
): string {
  if (frequency === "DAILY") return day;
  if (frequency === "WEEKLY") return startOfWeek(day);
  if (frequency === "MONTHLY") return startOfMonth(day);
  return startOfYear(day);
}

export type ReviewAnswerInput = {
  question: string;
  answer: string;
};

export type ReadReviewsInput = {
  frequency: ReviewFrequency;
  day: string;
};

export type WriteReviewsInput = ReadReviewsInput & {
  answers: ReviewAnswerInput[];
};

function parseReviewPeriod(
  input: Record<string, unknown>,
): ParseResult<ReadReviewsInput> {
  const frequencyRaw = requiredString(input, "frequency", 20);
  if (!frequencyRaw.ok) return frequencyRaw;
  const frequency = parseReviewFrequency(frequencyRaw.value);
  if (!frequency) {
    return {
      ok: false,
      message: 'frequency must be "daily", "weekly", "monthly", or "yearly".',
    };
  }
  const day = requiredDay(input, "day");
  if (!day.ok) return day;
  return {
    ok: true,
    value: { frequency, day: canonicalReviewDay(frequency, day.value) },
  };
}

export function parseReadReviewsInput(
  input: Record<string, unknown>,
): ParseResult<ReadReviewsInput> {
  return parseReviewPeriod(input);
}

export function parseWriteReviewsInput(
  input: Record<string, unknown>,
): ParseResult<WriteReviewsInput> {
  const period = parseReviewPeriod(input);
  if (!period.ok) return period;
  if (!("answers" in input) || input.answers === undefined || input.answers === null) {
    return { ok: false, message: "answers is required." };
  }
  if (!Array.isArray(input.answers)) {
    return { ok: false, message: "answers must be a list." };
  }
  if (input.answers.length === 0) {
    return { ok: false, message: "answers must include at least one answer." };
  }
  if (input.answers.length > 40) {
    return { ok: false, message: "answers can include at most 40 items." };
  }
  const answers: ReviewAnswerInput[] = [];
  for (const item of input.answers) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, message: "Each answer must be an object with question and answer." };
    }
    const record = item as Record<string, unknown>;
    const question = requiredString(record, "question", 500);
    if (!question.ok) return question;
    if (!("answer" in record) || record.answer === undefined || record.answer === null) {
      return { ok: false, message: "answer is required." };
    }
    if (typeof record.answer !== "string") {
      return { ok: false, message: "answer must be a string." };
    }
    if (record.answer.length > 8000) {
      return { ok: false, message: "answer must be 8000 characters or fewer." };
    }
    answers.push({ question: question.value, answer: record.answer });
  }
  return { ok: true, value: { ...period.value, answers } };
}

export type AgentQuestionChoice<T> =
  | { status: "match"; question: T }
  | { status: "none" }
  | { status: "ambiguous"; names: string[] };

export function resolveReviewQuestion<T extends { questionText: string }>(
  questions: readonly T[],
  hint: string,
): AgentQuestionChoice<T> {
  const q = hint.trim().toLowerCase();
  if (!q) return { status: "none" };
  const exact = questions.filter(
    (question) => question.questionText.trim().toLowerCase() === q,
  );
  if (exact.length === 1) return { status: "match", question: exact[0] };
  if (exact.length > 1) {
    return {
      status: "ambiguous",
      names: exact.map((question) => question.questionText),
    };
  }
  if (q.length < 3) return { status: "none" };
  const partial = questions.filter((question) =>
    question.questionText.trim().toLowerCase().includes(q),
  );
  if (partial.length === 1) return { status: "match", question: partial[0] };
  if (partial.length > 1) {
    return {
      status: "ambiguous",
      names: partial.map((question) => question.questionText),
    };
  }
  return { status: "none" };
}

export type TaskLocator = {
  taskId?: string;
  name?: string;
  list?: string;
  /** Day the task is already on, used only to tell copies apart. */
  day?: string;
};

export const DEFAULT_TASK_DROP_SECONDS = 30 * 60;
export const MIN_TASK_DROP_SECONDS = 5 * 60;

/** Duration used when a task is dropped on the calendar with no explicit length. */
export function taskDropDurationSeconds(estimate: number | undefined): number {
  const chosen =
    typeof estimate === "number" && estimate > 60
      ? estimate
      : DEFAULT_TASK_DROP_SECONDS;
  return Math.max(MIN_TASK_DROP_SECONDS, chosen);
}

export type AddToCalendarInput = {
  taskId?: string;
  name?: string;
  list?: string;
  /** Day the task is already on, used only to tell copies apart. */
  taskDay?: string;
  day: string;
  startTime: string;
  durationMinutes?: number;
  timeZone: string;
};

export type CompleteTaskInput = TaskLocator & {
  completed: boolean;
  completedOn?: string;
  timeZone: string;
};

export function todayInTimeZone(timeZone: string, now = Date.now()): string {
  return wallClockInTimeZone(now, timeZone).startDayYYYYMMDD;
}

function clockToMinutes(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map((part) => Number(part));
  return hour * 60 + minute;
}

function parseTaskLocator(
  input: Record<string, unknown>,
  dayKey = "day",
): ParseResult<TaskLocator> {
  const taskId = optionalString(input, "taskId");
  if (!taskId.ok) return taskId;
  const name = optionalString(input, "name");
  if (!name.ok) return name;
  if (name.value && name.value.length > 500) {
    return { ok: false, message: "name must be 500 characters or fewer." };
  }
  if (!taskId.value && !name.value) {
    return {
      ok: false,
      message: "Pass taskId or name so the task can be found.",
    };
  }
  const list = optionalString(input, "list");
  if (!list.ok) return list;
  const day = optionalDay(input, dayKey);
  if (!day.ok) return day;
  return {
    ok: true,
    value: {
      taskId: taskId.value,
      name: name.value,
      list: list.value,
      day: day.value,
    },
  };
}

export function parseAddToCalendarInput(
  input: Record<string, unknown>,
): ParseResult<AddToCalendarInput> {
  const locator = parseTaskLocator(input, "taskDay");
  if (!locator.ok) return locator;
  const day = requiredDay(input, "day");
  if (!day.ok) return day;
  const startTime = optionalClock(input, "startTime");
  if (!startTime.ok) return startTime;
  if (!startTime.value) {
    return { ok: false, message: "startTime is required." };
  }
  const endTime = optionalClock(input, "endTime");
  if (!endTime.ok) return endTime;
  const durationMinutes = optionalDuration(input, "durationMinutes");
  if (!durationMinutes.ok) return durationMinutes;
  let minutes = durationMinutes.value;
  if (endTime.value) {
    const span = clockToMinutes(endTime.value) - clockToMinutes(startTime.value);
    if (span <= 0) {
      return {
        ok: false,
        message: "endTime must be after startTime on the same day.",
      };
    }
    if (span < 5) {
      return { ok: false, message: "A calendar block must be at least 5 minutes." };
    }
    minutes = span;
  }
  const timeZone = optionalString(input, "timeZone");
  if (!timeZone.ok) return timeZone;
  const zone = timeZone.value ?? "UTC";
  if (!isValidTimeZone(zone)) {
    return { ok: false, message: "timeZone must be an IANA time zone." };
  }
  return {
    ok: true,
    value: {
      taskId: locator.value.taskId,
      name: locator.value.name,
      list: locator.value.list,
      taskDay: locator.value.day,
      day: day.value,
      startTime: startTime.value,
      durationMinutes: minutes,
      timeZone: zone,
    },
  };
}

export function parseCompleteTaskInput(
  input: Record<string, unknown>,
): ParseResult<CompleteTaskInput> {
  const locator = parseTaskLocator(input);
  if (!locator.ok) return locator;
  const completed = optionalBoolean(input, "completed");
  if (!completed.ok) return completed;
  const completedOn = optionalDay(input, "completedOn");
  if (!completedOn.ok) return completedOn;
  const timeZone = optionalString(input, "timeZone");
  if (!timeZone.ok) return timeZone;
  const zone = timeZone.value ?? "UTC";
  if (!isValidTimeZone(zone)) {
    return { ok: false, message: "timeZone must be an IANA time zone." };
  }
  return {
    ok: true,
    value: {
      ...locator.value,
      completed: completed.value !== false,
      completedOn: completedOn.value,
      timeZone: zone,
    },
  };
}

export type NamedTaskChoice<T> =
  | { status: "match"; task: T }
  | { status: "none" }
  | { status: "ambiguous"; tasks: T[] };

/** Exact name first. A partial match counts only when it is the only one. */
export function resolveNamedTask<T extends { name: string }>(
  tasks: readonly T[],
  hint: string,
): NamedTaskChoice<T> {
  const q = hint.trim().toLowerCase();
  if (!q) return { status: "none" };
  const exact = tasks.filter((task) => task.name.trim().toLowerCase() === q);
  if (exact.length === 1) return { status: "match", task: exact[0] };
  if (exact.length > 1) return { status: "ambiguous", tasks: exact };
  if (q.length < 3) return { status: "none" };
  const partial = tasks.filter((task) =>
    task.name.trim().toLowerCase().includes(q),
  );
  if (partial.length === 1) return { status: "match", task: partial[0] };
  if (partial.length > 1) return { status: "ambiguous", tasks: partial };
  return { status: "none" };
}
