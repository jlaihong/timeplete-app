import { internalMutation, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  actionSpec,
  asInputRecord,
  formatDay,
  isAgentAction,
  parseCompleteTaskInput,
  parseCreateEventInput,
  parseCreateTaskInput,
  parseListEventsInput,
  parseReadReviewsInput,
  parseRescheduleInput,
  parseAddToCalendarInput,
  parseSearchTasksInput,
  parseWriteReviewsInput,
  taskDropDurationSeconds,
  resolveAgentList,
  resolveNamedTask,
  resolveReviewQuestion,
  todayInTimeZone,
  type AgentActionName,
  type CompleteTaskInput,
  type RescheduleInput,
  type ReviewFrequency,
  type TaskLocator,
} from "../lib/agentActions";
import { displayReviewQuestions } from "../lib/reviewParity";
import { wallClockGridToEpochMs } from "./_helpers/wallClockTimeZone";
import {
  onTimeWindowInserted,
  onTimeWindowPatched,
} from "./_helpers/taskTimeSpent";
import {
  onAttributedWindowInserted,
  onAttributedWindowPatched,
  onTaskCompletionAttribution,
  type WindowLifetimeRow,
} from "./_helpers/trackableLifetime";
import { recordDeletedRecurringEventOccurrence } from "./_helpers/deletedRecurringEventOccurrence";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";

const LAST_USED_MIN_GAP_MS = 5 * 60 * 1000;
const MAX_EVENTS = 200;
const MAX_WINDOWS_SCANNED = 500;
const MAX_TASKS = 50;

type ApiError = {
  code: string;
  message: string;
  candidates?: Array<{
    id: string;
    title: string;
    day: string;
    startTime: string;
  }>;
  lists?: string[];
  questions?: string[];
  tasks?: Array<{
    id: string;
    name: string;
    day: string | null;
    list: string | null;
  }>;
};

type ApiOutcome = {
  status: number;
  body:
    | { ok: true; result: unknown }
    | { ok: false; error: ApiError };
};

function fail(
  status: number,
  code: string,
  message: string,
  extra?: Pick<ApiError, "candidates" | "lists" | "questions" | "tasks">,
): ApiOutcome {
  return {
    status,
    body: { ok: false, error: { code, message, ...extra } },
  };
}

function ok(result: unknown): ApiOutcome {
  return { status: 200, body: { ok: true, result } };
}

function lifetimeRow(tw: Doc<"timeWindows">): WindowLifetimeRow {
  return {
    userId: tw.userId,
    trackableId: tw.trackableId,
    taskId: tw.taskId,
    listId: tw.listId,
    budgetType: tw.budgetType,
    durationSeconds: tw.durationSeconds,
    startDayYYYYMMDD: tw.startDayYYYYMMDD,
    activityType: tw.activityType,
  };
}

function minutesFromHHMM(hhmm: string): number {
  const [hour, minute] = hhmm.split(":").map((part) => parseInt(part, 10));
  return hour * 60 + minute;
}

function epochFor(day: string, hhmm: string, timeZone: string): number | undefined {
  try {
    return wallClockGridToEpochMs(day, minutesFromHHMM(hhmm), timeZone);
  } catch {
    return undefined;
  }
}

async function consumeKey(
  ctx: MutationCtx,
  keyHash: string,
): Promise<
  | { ok: true; user: Doc<"users">; key: Doc<"apiKeys"> }
  | { ok: false; outcome: ApiOutcome }
> {
  const key = await ctx.db
    .query("apiKeys")
    .withIndex("by_keyHash", (q) => q.eq("keyHash", keyHash))
    .unique();
  if (!key || key.revokedAt !== undefined) {
    return {
      ok: false,
      outcome: fail(401, "unauthorized", "Invalid API key."),
    };
  }
  const user = await ctx.db.get(key.userId);
  if (!user || !user.isApproved) {
    return {
      ok: false,
      outcome: fail(401, "unauthorized", "Invalid API key."),
    };
  }
  const now = Date.now();
  if (
    key.lastUsedAt === undefined ||
    now - key.lastUsedAt >= LAST_USED_MIN_GAP_MS
  ) {
    await ctx.db.patch(key._id, { lastUsedAt: now });
  }
  return { ok: true, user, key };
}

function grantedScopes(scopes: readonly string[]): AgentActionName[] {
  return scopes.filter(isAgentAction);
}

async function ownedLists(
  ctx: MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"lists">[]> {
  return await ctx.db
    .query("lists")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(200);
}

function listNames(lists: readonly Doc<"lists">[]): string[] {
  return lists.filter((list) => !list.archived).map((list) => list.name);
}

async function resolveOwnedList(
  ctx: MutationCtx,
  user: Doc<"users">,
  hint: string | undefined,
): Promise<{ ok: true; list: Doc<"lists"> } | { ok: false; outcome: ApiOutcome }> {
  const lists = await ownedLists(ctx, user._id);
  if (!hint) {
    const inboxes = lists
      .filter((list) => list.isInbox && !list.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const inbox = inboxes[0];
    if (!inbox) {
      return {
        ok: false,
        outcome: fail(
          400,
          "bad_input",
          "No Inbox list exists, so pass a list name.",
          { lists: listNames(lists) },
        ),
      };
    }
    return { ok: true, list: inbox };
  }
  const match = resolveAgentList(lists, hint);
  if (match.status === "match") return { ok: true, list: match.list };
  if (match.status === "ambiguous") {
    return {
      ok: false,
      outcome: fail(
        409,
        "ambiguous",
        `More than one list matches "${hint}".`,
        { lists: match.names },
      ),
    };
  }
  return {
    ok: false,
    outcome: fail(404, "not_found", `No list named "${hint}".`, {
      lists: listNames(lists),
    }),
  };
}

async function defaultSectionId(
  ctx: MutationCtx,
  listId: Id<"lists">,
): Promise<Id<"listSections"> | undefined> {
  const sections = await ctx.db
    .query("listSections")
    .withIndex("by_list", (q) => q.eq("listId", listId))
    .take(20);
  if (sections.length === 0) return undefined;
  const sorted = [...sections].sort((a, b) => a.orderIndex - b.orderIndex);
  const fallback = sorted.find((section) => section.isDefaultSection) ?? sorted[0];
  return fallback?._id;
}

async function displayTitle(
  ctx: MutationCtx,
  tw: Doc<"timeWindows">,
  taskNames: Map<string, string>,
): Promise<string> {
  if (tw.title && tw.title.trim().length > 0) return tw.title.trim();
  if (tw.taskId) {
    const cached = taskNames.get(tw.taskId);
    if (cached) return cached;
    const task = await ctx.db.get(tw.taskId);
    const name = task?.name?.trim() || "Untitled";
    taskNames.set(tw.taskId, name);
    return name;
  }
  return "Untitled";
}

/** Blocks the calendar shows. Timer logs and manual time entries stay out. */
function isCalendarWindow(tw: Doc<"timeWindows">): boolean {
  return (
    tw.budgetType === "ACTUAL" &&
    tw.source !== "timer" &&
    tw.source !== "manual" &&
    tw.source !== "tracker_entry"
  );
}

function eventJson(
  tw: Doc<"timeWindows">,
  title: string,
): {
  id: Id<"timeWindows">;
  title: string;
  day: string;
  startTime: string;
  durationMinutes: number;
  activityType: Doc<"timeWindows">["activityType"];
  recurring: boolean;
} {
  return {
    id: tw._id,
    title,
    day: formatDay(tw.startDayYYYYMMDD),
    startTime: tw.startTimeHHMM,
    durationMinutes: Math.round(tw.durationSeconds / 60),
    activityType: tw.activityType,
    recurring: tw.isRecurringInstance === true && !!tw.recurringEventId,
  };
}

async function applyWindowTime(
  ctx: MutationCtx,
  tw: Doc<"timeWindows">,
  next: { day: string; startTime: string; durationSeconds: number },
  detach: boolean,
): Promise<void> {
  const before = lifetimeRow(tw);
  await ctx.db.patch(tw._id, {
    startDayYYYYMMDD: next.day,
    startTimeHHMM: next.startTime,
    durationSeconds: next.durationSeconds,
    startTimeEpochMs: epochFor(next.day, next.startTime, tw.timeZone),
    ...(detach
      ? { recurringEventId: undefined, isRecurringInstance: false }
      : {}),
  });
  const after: WindowLifetimeRow = {
    ...before,
    startDayYYYYMMDD: next.day,
    durationSeconds: next.durationSeconds,
  };
  await onTimeWindowPatched(
    ctx,
    {
      taskId: tw.taskId,
      activityType: tw.activityType,
      budgetType: tw.budgetType,
      durationSeconds: tw.durationSeconds,
    },
    {
      taskId: tw.taskId,
      activityType: tw.activityType,
      budgetType: tw.budgetType,
      durationSeconds: next.durationSeconds,
    },
  );
  await onAttributedWindowPatched(ctx, before, after);
}

async function runListLists(ctx: MutationCtx, user: Doc<"users">): Promise<ApiOutcome> {
  const lists = await ownedLists(ctx, user._id);
  return ok({
    lists: lists
      .filter((list) => !list.archived)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((list) => ({
        id: list._id,
        name: list.name,
        isInbox: list.isInbox,
      })),
  });
}

async function runSearchTasks(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseSearchTasksInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;

  let listId: Id<"lists"> | undefined;
  if (args.list) {
    const resolved = await resolveOwnedList(ctx, user, args.list);
    if (!resolved.ok) return resolved.outcome;
    listId = resolved.list._id;
  }

  let tasks: Doc<"tasks">[];
  if (args.day) {
    tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user_day", (q) =>
        q.eq("userId", user._id).eq("taskDay", args.day!),
      )
      .take(MAX_TASKS);
  } else if (listId) {
    tasks = await ctx.db
      .query("tasks")
      .withIndex("by_list", (q) => q.eq("listId", listId!))
      .take(MAX_TASKS);
  } else {
    tasks = await ctx.db
      .query("tasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(MAX_TASKS);
  }

  const needle = args.name?.toLowerCase();
  const filtered = tasks.filter((task) => {
    if (task.userId !== user._id) return false;
    if (listId && task.listId !== listId) return false;
    if (!args.includeCompleted && task.dateCompleted) return false;
    if (needle && !task.name.toLowerCase().includes(needle)) return false;
    return true;
  });

  const lists = await ownedLists(ctx, user._id);
  const names = new Map(lists.map((list) => [list._id, list.name]));

  return ok({
    tasks: filtered.map((task) => ({
      id: task._id,
      name: task.name,
      list: task.listId ? (names.get(task.listId) ?? null) : null,
      day: task.taskDay ? formatDay(task.taskDay) : null,
      dueDate: task.dueDateYYYYMMDD ? formatDay(task.dueDateYYYYMMDD) : null,
      completed: !!task.dateCompleted,
    })),
  });
}

async function runCreateTask(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseCreateTaskInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const resolved = await resolveOwnedList(ctx, user, args.list);
  if (!resolved.ok) return resolved.outcome;
  const list = resolved.list;
  const sectionId = await defaultSectionId(ctx, list._id);
  const taskId = await ctx.db.insert("tasks", {
    name: args.name,
    timeSpentInSecondsUnallocated: 0,
    timeEstimatedInSecondsUnallocated: 0,
    dueDateYYYYMMDD: args.dueDate,
    listId: list._id,
    taskDay: args.day,
    taskDayOrderIndex: 0,
    sectionId,
    sectionOrderIndex: 0,
    isRecurringInstance: false,
    userId: user._id,
    createdBy: user._id,
  });
  await ctx.db.patch(taskId, { rootTaskId: taskId });
  return ok({
    taskId,
    name: args.name,
    list: list.name,
    day: args.day ? formatDay(args.day) : null,
    dueDate: args.dueDate ? formatDay(args.dueDate) : null,
  });
}

async function windowsInRange(
  ctx: MutationCtx,
  userId: Id<"users">,
  startDay: string,
  endDay: string,
): Promise<{ windows: Doc<"timeWindows">[]; truncated: boolean }> {
  const rows = await ctx.db
    .query("timeWindows")
    .withIndex("by_user_day", (q) =>
      q
        .eq("userId", userId)
        .gte("startDayYYYYMMDD", startDay)
        .lte("startDayYYYYMMDD", endDay),
    )
    .take(MAX_WINDOWS_SCANNED + 1);
  const scannedAll = rows.length <= MAX_WINDOWS_SCANNED;
  const calendar = (scannedAll ? rows : rows.slice(0, MAX_WINDOWS_SCANNED)).filter(
    isCalendarWindow,
  );
  const truncated = !scannedAll || calendar.length > MAX_EVENTS;
  return { windows: calendar.slice(0, MAX_EVENTS), truncated };
}

async function runListEvents(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseListEventsInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const { windows, truncated } = await windowsInRange(
    ctx,
    user._id,
    parsed.value.startDay,
    parsed.value.endDay,
  );
  const taskNames = new Map<string, string>();
  const events = [];
  for (const window of windows) {
    if (window.userId !== user._id) continue;
    events.push(eventJson(window, await displayTitle(ctx, window, taskNames)));
  }
  return ok({ events, truncated });
}

async function runCreateEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseCreateEventInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const durationSeconds = args.durationMinutes * 60;
  const eventId = await ctx.db.insert("timeWindows", {
    startTimeHHMM: args.startTime,
    startDayYYYYMMDD: args.day,
    startTimeEpochMs: epochFor(args.day, args.startTime, args.timeZone),
    durationSeconds,
    userId: user._id,
    budgetType: "ACTUAL",
    activityType: "EVENT",
    title: args.title,
    timeZone: args.timeZone,
    useTimeZone: args.useTimeZone,
    isRecurringInstance: false,
    source: "calendar",
  });
  const inserted = {
    taskId: undefined,
    activityType: "EVENT" as const,
    budgetType: "ACTUAL" as const,
    durationSeconds,
  };
  await onTimeWindowInserted(ctx, inserted);
  await onAttributedWindowInserted(ctx, {
    userId: user._id,
    trackableId: undefined,
    taskId: undefined,
    listId: undefined,
    budgetType: "ACTUAL",
    durationSeconds,
    startDayYYYYMMDD: args.day,
    activityType: "EVENT",
  });
  return ok({
    eventId,
    title: args.title,
    day: formatDay(args.day),
    startTime: args.startTime,
    durationMinutes: args.durationMinutes,
  });
}

async function findEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: RescheduleInput,
): Promise<
  | { ok: true; window: Doc<"timeWindows"> }
  | { ok: false; outcome: ApiOutcome }
> {
  if (args.eventId) {
    const id = ctx.db.normalizeId("timeWindows", args.eventId);
    const window = id ? await ctx.db.get(id) : null;
    if (!window || window.userId !== user._id || !isCalendarWindow(window)) {
      return {
        ok: false,
        outcome: fail(404, "not_found", "Event not found."),
      };
    }
    return { ok: true, window };
  }

  const { windows } = await windowsInRange(ctx, user._id, args.day!, args.day!);
  const taskNames = new Map<string, string>();
  const matches: Doc<"timeWindows">[] = [];
  const wanted = args.title!.trim().toLowerCase();
  for (const window of windows) {
    if (window.userId !== user._id) continue;
    const title = (await displayTitle(ctx, window, taskNames)).toLowerCase();
    if (title === wanted) matches.push(window);
  }
  if (matches.length === 0) {
    return {
      ok: false,
      outcome: fail(404, "not_found", `No event titled "${args.title}" on that day.`),
    };
  }
  if (matches.length > 1) {
    const candidates = [];
    for (const window of matches) {
      candidates.push({
        id: window._id,
        title: await displayTitle(ctx, window, taskNames),
        day: formatDay(window.startDayYYYYMMDD),
        startTime: window.startTimeHHMM,
      });
    }
    return {
      ok: false,
      outcome: fail(
        409,
        "ambiguous",
        "More than one event matches. Pass eventId.",
        { candidates },
      ),
    };
  }
  return { ok: true, window: matches[0] };
}

async function runReschedule(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseRescheduleInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const found = await findEvent(ctx, user, args);
  if (!found.ok) return found.outcome;
  const window = found.window;

  if (args.occurrence === "series") {
    if (!window.recurringEventId) {
      return fail(
        400,
        "bad_input",
        'This event is not part of a series. Omit occurrence or pass "this".',
      );
    }
    const rule = await ctx.db.get(window.recurringEventId);
    if (!rule || rule.userId !== user._id) {
      return fail(404, "not_found", "Event series not found.");
    }
    const nextTime = args.newStartTime ?? rule.startTimeHHMM;
    const nextDuration =
      args.durationMinutes !== undefined
        ? args.durationMinutes * 60
        : rule.durationSeconds;
    const oldTime = rule.startTimeHHMM;
    const oldDuration = rule.durationSeconds;
    await ctx.db.patch(rule._id, {
      startTimeHHMM: nextTime,
      durationSeconds: nextDuration,
    });
    const instances = await ctx.db
      .query("timeWindows")
      .withIndex("by_recurring_event", (q) =>
        q.eq("recurringEventId", rule._id),
      )
      .take(MAX_EVENTS + 1);
    const truncated = instances.length > MAX_EVENTS;
    let updatedCount = 0;
    for (const instance of truncated ? instances.slice(0, MAX_EVENTS) : instances) {
      if (instance.userId !== user._id) continue;
      if (instance.startDayYYYYMMDD < window.startDayYYYYMMDD) continue;
      if (
        instance.startTimeHHMM !== oldTime ||
        instance.durationSeconds !== oldDuration
      ) {
        continue;
      }
      await applyWindowTime(
        ctx,
        instance,
        {
          day: instance.startDayYYYYMMDD,
          startTime: nextTime,
          durationSeconds: nextDuration,
        },
        false,
      );
      updatedCount++;
    }
    return ok({
      eventId: window._id,
      occurrence: "series",
      day: formatDay(window.startDayYYYYMMDD),
      startTime: nextTime,
      durationMinutes: Math.round(nextDuration / 60),
      updatedCount,
      truncated,
    });
  }

  const nextDay = args.newDay ?? window.startDayYYYYMMDD;
  const nextTime = args.newStartTime ?? window.startTimeHHMM;
  const nextDuration =
    args.durationMinutes !== undefined
      ? args.durationMinutes * 60
      : window.durationSeconds;
  const movingDay =
    nextDay !== window.startDayYYYYMMDD &&
    window.isRecurringInstance === true &&
    !!window.recurringEventId;
  if (movingDay && window.recurringEventId) {
    await recordDeletedRecurringEventOccurrence(ctx, {
      recurringEventId: window.recurringEventId,
      deletedDateYYYYMMDD: window.startDayYYYYMMDD,
      userId: user._id,
    });
  }
  await applyWindowTime(
    ctx,
    window,
    { day: nextDay, startTime: nextTime, durationSeconds: nextDuration },
    movingDay,
  );
  return ok({
    eventId: window._id,
    occurrence: "this",
    day: formatDay(nextDay),
    startTime: nextTime,
    durationMinutes: Math.round(nextDuration / 60),
    updatedCount: 1,
  });
}

const MAX_REVIEW_ROWS = 100;

async function loadReviewPeriod(
  ctx: MutationCtx,
  user: Doc<"users">,
  frequency: ReviewFrequency,
  day: string,
) {
  const questions = await ctx.db
    .query("reviewQuestions")
    .withIndex("by_user_frequency", (q) =>
      q.eq("userId", user._id).eq("frequency", frequency),
    )
    .take(MAX_REVIEW_ROWS);
  const answers = await ctx.db
    .query("reviewAnswers")
    .withIndex("by_user_frequency_day", (q) =>
      q
        .eq("userId", user._id)
        .eq("frequency", frequency)
        .eq("dayUnderReview", day),
    )
    .take(MAX_REVIEW_ROWS);
  return { questions, answers };
}

function reviewResult(
  frequency: ReviewFrequency,
  day: string,
  questions: Doc<"reviewQuestions">[],
  answers: Doc<"reviewAnswers">[],
) {
  const visible = displayReviewQuestions(questions, answers);
  const answerByQuestion = new Map(
    answers.map((answer) => [answer.reviewQuestionId, answer.answerText]),
  );
  return {
    frequency: frequency.toLowerCase(),
    day: formatDay(day),
    questions: visible.map((question) => ({
      questionId: question._id,
      question: question.questionText,
      archived: question.archived,
      answer: answerByQuestion.get(question._id) ?? null,
    })),
  };
}

async function runReadReviews(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseReadReviewsInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const loaded = await loadReviewPeriod(
    ctx,
    user,
    parsed.value.frequency,
    parsed.value.day,
  );
  return ok(reviewResult(parsed.value.frequency, parsed.value.day, loaded.questions, loaded.answers));
}

async function runWriteReviews(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseWriteReviewsInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const { frequency, day, answers } = parsed.value;
  const loaded = await loadReviewPeriod(ctx, user, frequency, day);
  const questionNames = loaded.questions
    .filter((question) => !question.archived)
    .map((question) => question.questionText);

  const resolved: Array<{ question: Doc<"reviewQuestions">; answer: string }> = [];
  const seen = new Set<string>();
  for (const item of answers) {
    const choice = resolveReviewQuestion(loaded.questions, item.question);
    if (choice.status === "none") {
      return fail(
        404,
        "not_found",
        `No ${frequency.toLowerCase()} review question matches "${item.question}".`,
        { questions: questionNames },
      );
    }
    if (choice.status === "ambiguous") {
      return fail(
        409,
        "ambiguous",
        `More than one question matches "${item.question}".`,
        { questions: choice.names },
      );
    }
    if (choice.question.userId !== user._id) {
      return fail(404, "not_found", "Review question not found.");
    }
    if (seen.has(choice.question._id)) {
      return fail(
        400,
        "bad_input",
        `Question "${choice.question.questionText}" is listed more than once.`,
      );
    }
    seen.add(choice.question._id);
    resolved.push({ question: choice.question, answer: item.answer });
  }

  for (const item of resolved) {
    const existing = await ctx.db
      .query("reviewAnswers")
      .withIndex("by_user_frequency_day", (q) =>
        q
          .eq("userId", user._id)
          .eq("frequency", frequency)
          .eq("dayUnderReview", day),
      )
      .filter((q) => q.eq(q.field("reviewQuestionId"), item.question._id))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { answerText: item.answer });
    } else {
      await ctx.db.insert("reviewAnswers", {
        reviewQuestionId: item.question._id,
        userId: user._id,
        answerText: item.answer,
        frequency,
        dayUnderReview: day,
      });
    }
  }

  const saved = await loadReviewPeriod(ctx, user, frequency, day);
  return ok({
    ...reviewResult(frequency, day, saved.questions, saved.answers),
    saved: resolved.length,
  });
}

const MAX_TASK_MATCH = 200;

function displayDay(value: string | undefined): string | null {
  if (!value) return null;
  return /^\d{8}$/.test(value) ? formatDay(value) : value;
}

async function taskResult(
  ctx: MutationCtx,
  userId: Id<"users">,
  task: Doc<"tasks">,
) {
  const lists = await ownedLists(ctx, userId);
  const list = task.listId
    ? lists.find((item) => item._id === task.listId)
    : undefined;
  return {
    taskId: task._id,
    name: task.name,
    list: list?.name ?? null,
    day: displayDay(task.taskDay),
    completed: !!task.dateCompleted,
    completedOn: displayDay(task.dateCompleted),
  };
}

async function findTask(
  ctx: MutationCtx,
  user: Doc<"users">,
  args: TaskLocator,
): Promise<
  | { ok: true; task: Doc<"tasks"> }
  | { ok: false; outcome: ApiOutcome }
> {
  if (args.taskId) {
    const id = ctx.db.normalizeId("tasks", args.taskId);
    const task = id ? await ctx.db.get(id) : null;
    if (!task || task.userId !== user._id) {
      return {
        ok: false,
        outcome: fail(404, "not_found", "Task not found."),
      };
    }
    return { ok: true, task };
  }

  let listId: Id<"lists"> | undefined;
  if (args.list) {
    const resolved = await resolveOwnedList(ctx, user, args.list);
    if (!resolved.ok) return resolved;
    listId = resolved.list._id;
  }

  const rows = args.day
    ? await ctx.db
        .query("tasks")
        .withIndex("by_user_day", (q) =>
          q.eq("userId", user._id).eq("taskDay", args.day!),
        )
        .take(MAX_TASK_MATCH)
    : listId
      ? await ctx.db
          .query("tasks")
          .withIndex("by_list", (q) => q.eq("listId", listId))
          .take(MAX_TASK_MATCH)
      : await ctx.db
          .query("tasks")
          .withIndex("by_user", (q) => q.eq("userId", user._id))
          .order("desc")
          .take(MAX_TASK_MATCH);

  const pool = rows.filter(
    (task) =>
      task.userId === user._id && (listId === undefined || task.listId === listId),
  );
  const choice = resolveNamedTask(pool, args.name ?? "");
  if (choice.status === "none") {
    return {
      ok: false,
      outcome: fail(
        404,
        "not_found",
        `No task matches "${args.name}". Pass taskId, or add the list and day.`,
      ),
    };
  }
  if (choice.status === "ambiguous") {
    const lists = await ownedLists(ctx, user._id);
    const names = new Map(lists.map((list) => [list._id, list.name]));
    return {
      ok: false,
      outcome: fail(
        409,
        "ambiguous",
        "More than one task matches. Pass taskId.",
        {
          tasks: choice.tasks.slice(0, 8).map((task) => ({
            id: task._id,
            name: task.name,
            day: displayDay(task.taskDay),
            list: task.listId ? (names.get(task.listId) ?? null) : null,
          })),
        },
      ),
    };
  }
  return { ok: true, task: choice.task };
}

function endClock(startTime: string, durationSeconds: number): string {
  const totalMinutes = Math.round(
    (minutesFromHHMM(startTime) * 60 + durationSeconds) / 60,
  );
  const minute = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

async function runAddToCalendar(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseAddToCalendarInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const found = await findTask(ctx, user, {
    taskId: args.taskId,
    name: args.name,
    list: args.list,
    day: args.taskDay,
  });
  if (!found.ok) return found.outcome;
  const task = found.task;

  const durationSeconds =
    args.durationMinutes !== undefined
      ? args.durationMinutes * 60
      : taskDropDurationSeconds(task.timeEstimatedInSecondsUnallocated);
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(200);
  const trackableId = resolveSnapshotTrackableIdForTask({
    task: { trackableId: task.trackableId, listId: task.listId },
    listIdToTrackableId: buildListIdToTrackableId(links),
  });

  const eventId = await ctx.db.insert("timeWindows", {
    startTimeHHMM: args.startTime,
    startDayYYYYMMDD: args.day,
    startTimeEpochMs: epochFor(args.day, args.startTime, args.timeZone),
    durationSeconds,
    userId: user._id,
    budgetType: "ACTUAL",
    activityType: "TASK",
    taskId: task._id,
    trackableId,
    timeZone: args.timeZone,
    useTimeZone: false,
    isRecurringInstance: false,
    source: "calendar",
  });
  const inserted = {
    taskId: task._id,
    activityType: "TASK" as const,
    budgetType: "ACTUAL" as const,
    durationSeconds,
  };
  await onTimeWindowInserted(ctx, inserted);
  await onAttributedWindowInserted(ctx, {
    userId: user._id,
    trackableId,
    taskId: task._id,
    listId: undefined,
    budgetType: "ACTUAL",
    durationSeconds,
    startDayYYYYMMDD: args.day,
    activityType: "TASK",
  });

  return ok({
    eventId,
    taskId: task._id,
    name: task.name,
    day: formatDay(args.day),
    startTime: args.startTime,
    endTime: endClock(args.startTime, durationSeconds),
    durationMinutes: Math.round(durationSeconds / 60),
  });
}

async function runCompleteTask(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseCompleteTaskInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const found = await findTask(ctx, user, parsed.value);
  if (!found.ok) return found.outcome;
  const task = found.task;
  const args: CompleteTaskInput = parsed.value;
  const next = args.completed
    ? (args.completedOn ?? todayInTimeZone(args.timeZone))
    : undefined;
  if ((task.dateCompleted ?? undefined) !== next) {
    await ctx.db.patch(task._id, { dateCompleted: next });
    await onTaskCompletionAttribution(
      ctx,
      {
        userId: task.userId,
        dateCompleted: task.dateCompleted,
        trackableId: task.trackableId,
        listId: task.listId,
      },
      {
        userId: task.userId,
        dateCompleted: next,
        trackableId: task.trackableId,
        listId: task.listId,
      },
    );
  }
  const updated = await ctx.db.get(task._id);
  return ok(await taskResult(ctx, user._id, updated ?? task));
}

async function dispatch(
  ctx: MutationCtx,
  user: Doc<"users">,
  action: AgentActionName,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  switch (action) {
    case "list_lists":
      return await runListLists(ctx, user);
    case "search_tasks":
      return await runSearchTasks(ctx, user, input);
    case "create_task":
      return await runCreateTask(ctx, user, input);
    case "list_events":
      return await runListEvents(ctx, user, input);
    case "create_event":
      return await runCreateEvent(ctx, user, input);
    case "reschedule_event":
      return await runReschedule(ctx, user, input);
    case "read_reviews":
      return await runReadReviews(ctx, user, input);
    case "write_reviews":
      return await runWriteReviews(ctx, user, input);
    case "add_to_calendar":
      return await runAddToCalendar(ctx, user, input);
    case "complete_task":
      return await runCompleteTask(ctx, user, input);
  }
}

export const discover = internalMutation({
  args: { keyHash: v.string() },
  handler: async (ctx, args): Promise<ApiOutcome> => {
    const consumed = await consumeKey(ctx, args.keyHash);
    if (!consumed.ok) return consumed.outcome;
    const scopes = grantedScopes(consumed.key.scopes);
    return ok({
      keyName: consumed.key.name,
      usage: {
        method: "POST",
        path: "/api/agent",
        headers: {
          Authorization: "Bearer <api key>",
          "Content-Type": "application/json",
        },
        body: { action: "<action name>", input: {} },
      },
      actions: scopes.map((name) => {
        const spec = actionSpec(name);
        return {
          name: spec.name,
          description: spec.description,
          input: spec.input,
        };
      }),
    });
  },
});

export const run = internalMutation({
  args: {
    keyHash: v.string(),
    action: v.string(),
    input: v.optional(v.any()),
  },
  handler: async (ctx, args): Promise<ApiOutcome> => {
    const consumed = await consumeKey(ctx, args.keyHash);
    if (!consumed.ok) return consumed.outcome;
    if (!isAgentAction(args.action)) {
      return fail(400, "bad_input", `Unknown action "${args.action}".`);
    }
    const scopes = grantedScopes(consumed.key.scopes);
    if (!scopes.includes(args.action)) {
      return fail(
        403,
        "forbidden",
        `This API key cannot use ${args.action}.`,
      );
    }
    const input = asInputRecord(args.input);
    if (!input.ok) return fail(400, "bad_input", input.message);
    return await dispatch(ctx, consumed.user, args.action, input.value);
  },
});
