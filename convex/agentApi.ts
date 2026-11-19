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
  parseDeleteEventInput,
  parseUpdateEventInput,
  parseListTrackablesInput,
  dayBefore,
  encodeEventCursor,
  takeEventPage,
  type EventCursor,
  parseReadReviewsInput,
  parseRescheduleInput,
  parseAddToCalendarInput,
  parseDeleteTaskInput,
  parseRenameTaskInput,
  parseSearchTasksInput,
  parseWriteReviewsInput,
  taskDropDurationSeconds,
  resolveAgentList,
  resolveNamedTask,
  resolveReviewQuestion,
  todayInTimeZone,
  type AgentActionName,
  type CompleteTaskInput,
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
  deleteTimeWindowWithSideEffects,
  onAttributedWindowInserted,
  removeTaskCompletionCredit,
  syncTaskAttribution,
  syncWindowAttribution,
} from "./_helpers/trackableLifetime";
import {
  deletedOccurrenceForRecurringInstance,
  recordDeletedRecurringEventOccurrence,
} from "./_helpers/deletedRecurringEventOccurrence";
import {
  buildListIdToTrackableId,
  resolveSnapshotTrackableIdForTask,
} from "./_helpers/trackableAttribution";
import {
  removeMentionsForSource,
  syncSourceMentions,
} from "./_helpers/mentions";

const LAST_USED_MIN_GAP_MS = 5 * 60 * 1000;
const MAX_EVENTS = 200;
const MAX_WINDOWS_SCANNED = 500;
/** delete_event refuses a series longer than this rather than half-delete it. */
const MAX_SERIES_DELETED = 1000;
const MAX_TRACKABLES_LISTED = 500;
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
  // Time tracked straight against a trackable has no title or task.
  const trackableId = tw.trackableId ?? tw.trackableIds?.[0];
  if (trackableId) {
    const cached = taskNames.get(trackableId);
    if (cached) return cached;
    const trackable = await ctx.db.get(trackableId);
    const name = trackable?.name?.trim() || "Untitled";
    taskNames.set(trackableId, name);
    return name;
  }
  return "Untitled";
}

/**
 * Everything the agent can list, move and delete: calendar events plus
 * timer logs and manual time entries. The app treats them all alike.
 */
function isListedWindow(tw: Doc<"timeWindows">): boolean {
  return tw.budgetType === "ACTUAL" && tw.source !== "tracker_entry";
}

type TrackableRef = { id: Id<"trackables">; name: string };

/** Names for trackable ids, skipping any that no longer exist. */
async function trackableRefs(
  ctx: MutationCtx,
  ids: readonly Id<"trackables">[],
  names: Map<string, string>,
): Promise<TrackableRef[]> {
  const refs: TrackableRef[] = [];
  for (const id of new Set(ids)) {
    let name = names.get(id);
    if (name === undefined) {
      const trackable = await ctx.db.get(id);
      if (!trackable) continue;
      name = trackable.name?.trim() || "Untitled";
      names.set(id, name);
    }
    refs.push({ id, name });
  }
  return refs;
}

function eventJson(
  tw: Doc<"timeWindows">,
  title: string,
  trackables: TrackableRef[],
  countsToward: TrackableRef[],
): {
  id: Id<"timeWindows">;
  title: string;
  day: string;
  startTime: string;
  durationMinutes: number;
  activityType: Doc<"timeWindows">["activityType"];
  recurring: boolean;
  source: "calendar" | "timer" | "manual" | "api_key";
  comments: string | null;
  trackables: TrackableRef[];
  countsToward: TrackableRef[];
} {
  return {
    id: tw._id,
    title,
    day: formatDay(tw.startDayYYYYMMDD),
    startTime: tw.startTimeHHMM,
    durationMinutes: Math.round(tw.durationSeconds / 60),
    activityType: tw.activityType,
    recurring: tw.isRecurringInstance === true && !!tw.recurringEventId,
    // Rows from before the field existed have no source.
    source:
      tw.source === "timer" || tw.source === "manual" || tw.source === "api_key"
        ? tw.source
        : "calendar",
    comments: tw.comments?.trim() || null,
    trackables,
    countsToward,
  };
}

async function applyWindowTime(
  ctx: MutationCtx,
  tw: Doc<"timeWindows">,
  next: { day: string; startTime: string; durationSeconds: number },
  detach: boolean,
): Promise<void> {
  await ctx.db.patch(tw._id, {
    startDayYYYYMMDD: next.day,
    startTimeHHMM: next.startTime,
    durationSeconds: next.durationSeconds,
    startTimeEpochMs: epochFor(next.day, next.startTime, tw.timeZone),
    ...(detach
      ? { recurringEventId: undefined, isRecurringInstance: false }
      : {}),
  });
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
  await syncWindowAttribution(ctx, tw._id, tw);
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
  await syncSourceMentions(ctx, "task", taskId, { isNew: true });
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
  include: (tw: Doc<"timeWindows">) => boolean,
  after?: EventCursor,
): Promise<{ windows: Doc<"timeWindows">[]; nextCursor: EventCursor | null }> {
  // Planned (BUDGETED) rows are never returned, so the index skips them
  // instead of letting them use up the scan.
  const limit = MAX_WINDOWS_SCANNED + 1;
  let rows: Doc<"timeWindows">[];
  if (after) {
    // The index orders by day, then creation time: finish the cursor's day,
    // then read the days after it.
    rows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user_budget_day", (q) =>
        q
          .eq("userId", userId)
          .eq("budgetType", "ACTUAL")
          .eq("startDayYYYYMMDD", after.day)
          .gt("_creationTime", after.creationTime),
      )
      .take(limit);
    if (rows.length < limit && after.day < endDay) {
      const later = await ctx.db
        .query("timeWindows")
        .withIndex("by_user_budget_day", (q) =>
          q
            .eq("userId", userId)
            .eq("budgetType", "ACTUAL")
            .gt("startDayYYYYMMDD", after.day)
            .lte("startDayYYYYMMDD", endDay),
        )
        .take(limit - rows.length);
      rows = rows.concat(later);
    }
  } else {
    rows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user_budget_day", (q) =>
        q
          .eq("userId", userId)
          .eq("budgetType", "ACTUAL")
          .gte("startDayYYYYMMDD", startDay)
          .lte("startDayYYYYMMDD", endDay),
      )
      .take(limit);
  }
  const { page, resumeAfter } = takeEventPage(
    rows,
    include,
    MAX_WINDOWS_SCANNED,
    MAX_EVENTS,
  );
  return {
    windows: page,
    nextCursor: resumeAfter
      ? {
          day: resumeAfter.startDayYYYYMMDD,
          creationTime: resumeAfter._creationTime,
        }
      : null,
  };
}

/** One event in the shape list_events returns. */
async function describeEvent(
  ctx: MutationCtx,
  window: Doc<"timeWindows">,
  taskNames: Map<string, string> = new Map(),
  trackableNames: Map<string, string> = new Map(),
) {
  const allocated =
    window.trackableIds ?? (window.trackableId ? [window.trackableId] : []);
  return eventJson(
    window,
    await displayTitle(ctx, window, taskNames),
    await trackableRefs(ctx, allocated, trackableNames),
    await trackableRefs(
      ctx,
      window.attributedTrackableIds ?? allocated,
      trackableNames,
    ),
  );
}

/** Checks trackable ids an agent sent: each must exist and be the user's. */
async function resolveTrackableIds(
  ctx: MutationCtx,
  user: Doc<"users">,
  rawIds: readonly string[],
): Promise<
  | { ok: true; ids: Id<"trackables">[] }
  | { ok: false; outcome: ApiOutcome }
> {
  const ids: Id<"trackables">[] = [];
  for (const raw of rawIds) {
    const id = ctx.db.normalizeId("trackables", raw);
    const trackable = id ? await ctx.db.get(id) : null;
    if (!id || !trackable || trackable.userId !== user._id) {
      return {
        ok: false,
        outcome: fail(
          400,
          "bad_input",
          `Unknown trackable id "${raw}". Get ids from list_trackables.`,
        ),
      };
    }
    ids.push(id);
  }
  return { ok: true, ids };
}

/** The trackable a task's time falls to when none is picked on the event. */
async function snapshotTrackableForTask(
  ctx: MutationCtx,
  userId: Id<"users">,
  taskId: Id<"tasks">,
): Promise<Id<"trackables"> | undefined> {
  const task = await ctx.db.get(taskId);
  if (!task) return undefined;
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .take(200);
  return resolveSnapshotTrackableIdForTask({
    task: { trackableId: task.trackableId, listId: task.listId },
    listIdToTrackableId: buildListIdToTrackableId(links),
  });
}

type DetailChanges = {
  title?: string;
  comments?: string;
  trackableIds?: Id<"trackables">[];
};

/** Title, comments and trackables as a series rule stores them. */
function ruleDetailPatch(changes: DetailChanges) {
  return {
    ...(changes.title !== undefined
      ? { title: changes.title || undefined }
      : {}),
    ...(changes.comments !== undefined
      ? { comments: changes.comments || undefined }
      : {}),
    ...(changes.trackableIds !== undefined
      ? {
          trackableId: changes.trackableIds[0],
          trackableIds:
            changes.trackableIds.length > 0 ? changes.trackableIds : undefined,
        }
      : {}),
  };
}

/** Writes the details onto one window, the way saving it in the app does. */
async function applyWindowDetails(
  ctx: MutationCtx,
  window: Doc<"timeWindows">,
  changes: DetailChanges,
  extra: { recurringEventId?: Id<"recurringEvents"> } = {},
): Promise<void> {
  const patch = { ...ruleDetailPatch(changes), ...extra };
  if (changes.trackableIds !== undefined && !changes.trackableIds[0] && window.taskId) {
    patch.trackableId = await snapshotTrackableForTask(
      ctx,
      window.userId,
      window.taskId,
    );
  }
  await ctx.db.patch(window._id, patch);
  await syncSourceMentions(ctx, "timeWindow", window._id);
  await syncWindowAttribution(ctx, window._id, window);
}

async function runUpdateEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseUpdateEventInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const found = await findEvent(ctx, user, args.eventId);
  if (!found.ok) return found.outcome;
  const window = found.window;

  const changes: DetailChanges = { title: args.title, comments: args.comments };
  if (args.trackableIds !== undefined) {
    const resolved = await resolveTrackableIds(ctx, user, args.trackableIds);
    if (!resolved.ok) return resolved.outcome;
    changes.trackableIds = resolved.ids;
  }

  if (args.occurrence === "this") {
    await applyWindowDetails(ctx, window, changes);
    return await updatedEventResult(ctx, window._id, "this", 1);
  }

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
  const instances = await ctx.db
    .query("timeWindows")
    .withIndex("by_recurring_event", (q) => q.eq("recurringEventId", rule._id))
    .take(MAX_SERIES_DELETED + 1);
  if (instances.length > MAX_SERIES_DELETED) {
    return fail(
      400,
      "bad_input",
      "This series is too long to change here. Change it in the app.",
    );
  }
  const mine = instances.filter(
    (instance) => instance.userId === user._id && instance.isRecurringInstance,
  );

  // From the first occurrence on, "this and future" is the whole series.
  const splitDay = window.startDayYYYYMMDD;
  const wholeSeries =
    args.occurrence === "entire_series_including_past" ||
    splitDay <= rule.startDateYYYYMMDD;

  let updatedCount = 0;
  if (wholeSeries) {
    await ctx.db.patch(rule._id, ruleDetailPatch(changes));
    for (const instance of mine) {
      await applyWindowDetails(ctx, instance, changes);
      updatedCount++;
    }
    return await updatedEventResult(ctx, window._id, args.occurrence, updatedCount);
  }

  // Split the series: the old rule ends the day before, and a copy with the
  // new details carries on from this occurrence. Days not written out yet
  // are generated from whichever rule covers them.
  const { _id, _creationTime, legacyId: _legacyId, ...ruleFields } = rule;
  const laterRuleId = await ctx.db.insert("recurringEvents", {
    ...ruleFields,
    ...ruleDetailPatch(changes),
    startDateYYYYMMDD: splitDay,
  });
  await ctx.db.patch(rule._id, { endDateYYYYMMDD: dayBefore(splitDay) });
  // Occurrences already deleted from the later part must stay deleted.
  const skips = await ctx.db
    .query("deletedRecurringEventOccurrences")
    .withIndex("by_recurring_date", (q) =>
      q.eq("recurringEventId", rule._id).gte("deletedDateYYYYMMDD", splitDay),
    )
    .take(MAX_SERIES_DELETED);
  for (const skip of skips) {
    await ctx.db.patch(skip._id, { recurringEventId: laterRuleId });
  }
  for (const instance of mine) {
    if (instance.startDayYYYYMMDD < splitDay) continue;
    await applyWindowDetails(ctx, instance, changes, {
      recurringEventId: laterRuleId,
    });
    updatedCount++;
  }
  return await updatedEventResult(ctx, window._id, args.occurrence, updatedCount);
}

async function updatedEventResult(
  ctx: MutationCtx,
  eventId: Id<"timeWindows">,
  occurrence: string,
  updatedCount: number,
): Promise<ApiOutcome> {
  const updated = await ctx.db.get(eventId);
  if (!updated) return fail(404, "not_found", "Event not found.");
  return ok({
    event: await describeEvent(ctx, updated),
    occurrence,
    updatedCount,
  });
}

async function runListTrackables(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseListTrackablesInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const rows = await ctx.db
    .query("trackables")
    .withIndex("by_user", (q) => q.eq("userId", user._id))
    .take(MAX_TRACKABLES_LISTED + 1);
  const truncated = rows.length > MAX_TRACKABLES_LISTED;
  const trackables = rows
    .slice(0, MAX_TRACKABLES_LISTED)
    .filter((row) => parsed.value.includeArchived || !row.archived)
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => ({
      id: row._id,
      name: row.name,
      parentId: row.parentId ?? null,
      archived: row.archived,
    }));
  return ok({ trackables, truncated });
}

async function runListEvents(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseListEventsInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const { windows, nextCursor } = await windowsInRange(
    ctx,
    user._id,
    parsed.value.startDay,
    parsed.value.endDay,
    isListedWindow,
    parsed.value.after,
  );
  const taskNames = new Map<string, string>();
  const trackableNames = new Map<string, string>();
  const events = [];
  for (const window of windows) {
    if (window.userId !== user._id) continue;
    events.push(await describeEvent(ctx, window, taskNames, trackableNames));
  }
  return ok({
    events,
    truncated: nextCursor !== null,
    nextCursor: nextCursor ? encodeEventCursor(nextCursor) : null,
  });
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
  const resolved = await resolveTrackableIds(ctx, user, args.trackableIds);
  if (!resolved.ok) return resolved.outcome;
  const trackableIds = resolved.ids;
  const eventId = await ctx.db.insert("timeWindows", {
    startTimeHHMM: args.startTime,
    startDayYYYYMMDD: args.day,
    startTimeEpochMs: epochFor(args.day, args.startTime, args.timeZone),
    durationSeconds,
    userId: user._id,
    budgetType: "ACTUAL",
    activityType: "EVENT",
    title: args.title,
    comments: args.comments,
    trackableId: trackableIds[0],
    trackableIds: trackableIds.length > 0 ? trackableIds : undefined,
    timeZone: args.timeZone,
    useTimeZone: args.useTimeZone,
    isRecurringInstance: false,
    source: "api_key",
  });
  await syncSourceMentions(ctx, "timeWindow", eventId, { isNew: true });
  const inserted = {
    taskId: undefined,
    activityType: "EVENT" as const,
    budgetType: "ACTUAL" as const,
    durationSeconds,
  };
  await onTimeWindowInserted(ctx, inserted);
  await onAttributedWindowInserted(ctx, eventId);
  return ok({
    eventId,
    title: args.title,
    day: formatDay(args.day),
    startTime: args.startTime,
    durationMinutes: args.durationMinutes,
    source: "api_key",
    comments: args.comments ?? null,
    trackables: await trackableRefs(ctx, trackableIds, new Map()),
  });
}

async function findEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  eventId: string,
): Promise<
  | { ok: true; window: Doc<"timeWindows"> }
  | { ok: false; outcome: ApiOutcome }
> {
  const id = ctx.db.normalizeId("timeWindows", eventId);
  const window = id ? await ctx.db.get(id) : null;
  if (!window || window.userId !== user._id || !isListedWindow(window)) {
    return {
      ok: false,
      outcome: fail(404, "not_found", "Event not found."),
    };
  }
  return { ok: true, window };
}

async function runDeleteEvent(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseDeleteEventInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const found = await findEvent(ctx, user, args.eventId);
  if (!found.ok) return found.outcome;
  const window = found.window;
  const deleted = {
    eventId: window._id,
    title: await displayTitle(ctx, window, new Map()),
    day: formatDay(window.startDayYYYYMMDD),
    startTime: window.startTimeHHMM,
  };

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
    const instances = await ctx.db
      .query("timeWindows")
      .withIndex("by_recurring_event", (q) =>
        q.eq("recurringEventId", rule._id),
      )
      .take(MAX_SERIES_DELETED + 1);
    if (instances.length > MAX_SERIES_DELETED) {
      return fail(
        400,
        "bad_input",
        "This series is too long to delete here. Delete it in the app.",
      );
    }
    // Same as "this and following" in the app: later occurrences go and the
    // series ends the day before, so nothing new is generated.
    let deletedCount = 0;
    for (const instance of instances) {
      if (instance.userId !== user._id || !instance.isRecurringInstance) continue;
      if (instance.startDayYYYYMMDD < window.startDayYYYYMMDD) continue;
      await removeMentionsForSource(ctx, "timeWindow", instance._id);
      await deleteTimeWindowWithSideEffects(ctx, instance);
      deletedCount++;
    }
    await ctx.db.patch(rule._id, {
      endDateYYYYMMDD: dayBefore(window.startDayYYYYMMDD),
    });
    return ok({ ...deleted, occurrence: "series", deletedCount });
  }

  await removeMentionsForSource(ctx, "timeWindow", window._id);
  // Record the skip in the same transaction, or the series recreates the day.
  const skip = deletedOccurrenceForRecurringInstance(window);
  if (skip) {
    await recordDeletedRecurringEventOccurrence(ctx, {
      ...skip,
      userId: user._id,
    });
  }
  await deleteTimeWindowWithSideEffects(ctx, window);
  return ok({ ...deleted, occurrence: "this", deletedCount: 1 });
}

async function runReschedule(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseRescheduleInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const args = parsed.value;
  const found = await findEvent(ctx, user, args.eventId);
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
    source: "api_key",
  });
  const inserted = {
    taskId: task._id,
    activityType: "TASK" as const,
    budgetType: "ACTUAL" as const,
    durationSeconds,
  };
  await onTimeWindowInserted(ctx, inserted);
  await onAttributedWindowInserted(ctx, eventId);

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
    await syncTaskAttribution(ctx, task._id, task);
  }
  const updated = await ctx.db.get(task._id);
  return ok(await taskResult(ctx, user._id, updated ?? task));
}

async function deleteTaskRow(
  ctx: MutationCtx,
  task: Doc<"tasks">,
): Promise<void> {
  const comments = await ctx.db
    .query("taskComments")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  for (const comment of comments) await ctx.db.delete(comment._id);

  const windows = await ctx.db
    .query("timeWindows")
    .withIndex("by_task", (q) => q.eq("taskId", task._id))
    .collect();
  for (const window of windows) {
    await deleteTimeWindowWithSideEffects(ctx, window);
  }

  if (task.dateCompleted) {
    await removeTaskCompletionCredit(ctx, task);
  }

  await ctx.db.delete(task._id);
}

async function runRenameTask(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseRenameTaskInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const found = await findTask(ctx, user, parsed.value);
  if (!found.ok) return found.outcome;
  const task = found.task;
  const { newName, occurrence } = parsed.value;

  if (occurrence === "series") {
    if (!task.recurringTaskId) {
      return fail(
        400,
        "bad_input",
        'This task is not repeating. Omit occurrence, or pass "this".',
      );
    }
    const rule = await ctx.db.get(task.recurringTaskId);
    if (!rule || rule.userId !== user._id) {
      return fail(404, "not_found", "Repeating task not found.");
    }
    const previousName = rule.name;
    if (rule.name !== newName) {
      await ctx.db.patch(rule._id, { name: newName });
    }
    const instances = await ctx.db
      .query("tasks")
      .withIndex("by_recurring", (q) =>
        q.eq("recurringTaskId", task.recurringTaskId!),
      )
      .collect();
    for (const instance of instances) {
      if (instance.userId !== user._id) continue;
      const followsSeries =
        instance._id === task._id || instance.name === previousName;
      if (followsSeries && instance.name !== newName) {
        await ctx.db.patch(instance._id, { name: newName });
        await syncSourceMentions(ctx, "task", instance._id);
      }
    }
    const updated = await ctx.db.get(task._id);
    return ok({
      ...(await taskResult(ctx, user._id, updated ?? { ...task, name: newName })),
      occurrence: "series",
    });
  }

  const patch: {
    name?: string;
    isException?: boolean;
    originalTaskDay?: string;
    seriesId?: Id<"recurringTasks">;
    isRecurringInstance?: boolean;
  } = {};
  if (task.name !== newName) patch.name = newName;
  if (task.recurringTaskId && task.name !== newName) {
    patch.isException = true;
    const originalDay = task.originalTaskDay ?? task.taskDay;
    if (originalDay) patch.originalTaskDay = originalDay;
    patch.seriesId = task.recurringTaskId;
    patch.isRecurringInstance = true;
  }
  if (Object.keys(patch).length > 0) {
    await ctx.db.patch(task._id, patch);
    if (patch.name !== undefined) {
      await syncSourceMentions(ctx, "task", task._id);
    }
  }
  const updated = await ctx.db.get(task._id);
  return ok({
    ...(await taskResult(ctx, user._id, updated ?? task)),
    occurrence: "this",
  });
}

async function runDeleteTask(
  ctx: MutationCtx,
  user: Doc<"users">,
  input: Record<string, unknown>,
): Promise<ApiOutcome> {
  const parsed = parseDeleteTaskInput(input);
  if (!parsed.ok) return fail(400, "bad_input", parsed.message);
  const found = await findTask(ctx, user, parsed.value);
  if (!found.ok) return found.outcome;
  const task = found.task;
  const snapshot = await taskResult(ctx, user._id, task);

  if (task.isRecurringInstance && task.recurringTaskId && task.taskDay) {
    const rule = await ctx.db.get(task.recurringTaskId);
    if (rule && rule.userId === user._id) {
      const existingSkip = await ctx.db
        .query("deletedRecurringOccurrences")
        .withIndex("by_recurring_date", (q) =>
          q
            .eq("recurringTaskId", task.recurringTaskId!)
            .eq("deletedDateYYYYMMDD", task.taskDay!),
        )
        .first();
      if (!existingSkip) {
        await ctx.db.insert("deletedRecurringOccurrences", {
          recurringTaskId: task.recurringTaskId,
          deletedDateYYYYMMDD: task.taskDay,
          userId: user._id,
        });
      }
    }
    await deleteTaskRow(ctx, task);
    return ok({ ...snapshot, deleted: true });
  }

  const children = await ctx.db
    .query("tasks")
    .withIndex("by_root", (q) => q.eq("rootTaskId", task._id))
    .collect();
  for (const child of children) {
    if (child._id !== task._id && child.userId === user._id) {
      await deleteTaskRow(ctx, child);
    }
  }
  await deleteTaskRow(ctx, task);
  return ok({ ...snapshot, deleted: true });
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
    case "update_event":
      return await runUpdateEvent(ctx, user, input);
    case "list_trackables":
      return await runListTrackables(ctx, user, input);
    case "delete_event":
      return await runDeleteEvent(ctx, user, input);
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
    case "rename_task":
      return await runRenameTask(ctx, user, input);
    case "delete_task":
      return await runDeleteTask(ctx, user, input);
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
