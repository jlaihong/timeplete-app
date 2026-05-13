/**
 * Synchronously patches Convex query caches when task time-spent changes:
 * - `tasks.setTimeSpent` (absolute target)
 * - `timers.stop` via {@link applyTimeSpentDeltaOptimisticUpdate} (additive slice)
 */
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { DEFAULT_EVENT_COLOR } from "./eventColors";
import { validatedOptionalIANATimeZone } from "./calendarGridTimeZone";
import { wallClockInTimeZone } from "./wallClockTimeZone";

type TrackedWindow = {
  id: string;
  startTime: string;
  durationSeconds: number;
};

type TrackedSession = {
  day: string;
  totalSeconds: number;
  windows: TrackedWindow[];
};

type TimeTrackedValue = {
  totalSeconds: number;
  sessions: TrackedSession[];
};

type TimeWindowSearchRow = NonNullable<
  FunctionReturnType<typeof api.timeWindows.search>
>[number];

/** Stable optimistic id — one synthetic manual slice per task in local cache. */
export function optimisticManualTimeSpentWindowId(
  taskId: Id<"tasks">,
): Id<"timeWindows"> {
  return `__optimistic_manual_tw__:${taskId}` as Id<"timeWindows">;
}

function stripManualOptimisticFromTracked(
  prev: TimeTrackedValue | undefined,
  taskId: Id<"tasks">,
): TimeTrackedValue | undefined {
  if (!prev?.sessions?.length) return prev;
  const oid = optimisticManualTimeSpentWindowId(taskId);
  const sessions: TrackedSession[] = [];
  for (const s of prev.sessions) {
    const wins = s.windows.filter((w) => w.id !== oid);
    if (!wins.length) continue;
    const totalSeconds = wins.reduce(
      (acc, w) => acc + w.durationSeconds,
      0,
    );
    sessions.push({ day: s.day, totalSeconds, windows: wins });
  }
  if (!sessions.length) {
    return { totalSeconds: 0, sessions: [] };
  }
  const totalSeconds = sessions.reduce((a, s) => a + s.totalSeconds, 0);
  return { totalSeconds, sessions };
}

function optimisticTimeTrackedValue(
  prev: TimeTrackedValue | undefined,
  taskId: Id<"tasks">,
  targetTotal: number,
  timeZone: string,
): TimeTrackedValue {
  const stripped = stripManualOptimisticFromTracked(prev, taskId);
  const target = Math.max(0, Math.floor(targetTotal));
  const tz = timeZone.trim() || "UTC";

  if (target === 0) return { totalSeconds: 0, sessions: [] };

  if (!stripped?.sessions.length) {
    const nowMs = Date.now();
    const startMs = nowMs - target * 1000;
    const wall = wallClockInTimeZone(startMs, tz);
    const oid = String(optimisticManualTimeSpentWindowId(taskId));
    return {
      totalSeconds: target,
      sessions: [
        {
          day: wall.startDayYYYYMMDD,
          totalSeconds: target,
          windows: [
            {
              id: oid,
              startTime: wall.startTimeHHMM,
              durationSeconds: target,
            },
          ],
        },
      ],
    };
  }

  const sessions: TrackedSession[] = stripped.sessions.map((s) => ({
    day: s.day,
    totalSeconds: s.totalSeconds,
    windows: s.windows.map((w) => ({ ...w })),
  }));

  type Ref = { sIdx: number; wIdx: number };
  const refs: Ref[] = [];
  for (let sIdx = 0; sIdx < sessions.length; sIdx++) {
    for (let wIdx = 0; wIdx < sessions[sIdx].windows.length; wIdx++) {
      refs.push({ sIdx, wIdx });
    }
  }

  if (refs.length === 0) {
    return optimisticTimeTrackedValue(undefined, taskId, target, tz);
  }

  refs.sort((a, b) => {
    const da = sessions[a.sIdx].day;
    const db = sessions[b.sIdx].day;
    const dc = db.localeCompare(da);
    if (dc !== 0) return dc;
    const ta = sessions[a.sIdx].windows[a.wIdx].startTime;
    const tb = sessions[b.sIdx].windows[b.wIdx].startTime;
    return tb.localeCompare(ta);
  });

  const currentSum = sessions.reduce(
    (a, s) => a + s.windows.reduce((b, w) => b + w.durationSeconds, 0),
    0,
  );
  const delta = target - currentSum;

  if (delta > 0) {
    const nowMs = Date.now();
    const startMs = nowMs - delta * 1000;
    const wall = wallClockInTimeZone(startMs, tz);
    const oid = String(optimisticManualTimeSpentWindowId(taskId));
    const newWin: TrackedWindow = {
      id: oid,
      startTime: wall.startTimeHHMM,
      durationSeconds: delta,
    };
    const day = wall.startDayYYYYMMDD;
    const sIdx = sessions.findIndex((s) => s.day === day);
    if (sIdx === -1) {
      sessions.push({ day, totalSeconds: delta, windows: [newWin] });
    } else {
      sessions[sIdx].windows.push(newWin);
      sessions[sIdx].windows.sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      );
      sessions[sIdx].totalSeconds = sessions[sIdx].windows.reduce(
        (a, w) => a + w.durationSeconds,
        0,
      );
    }
  } else {
    let toTrim = -delta;
    for (const r of refs) {
      if (toTrim <= 0) break;
      const w = sessions[r.sIdx].windows[r.wIdx];
      const take = Math.min(w.durationSeconds, toTrim);
      w.durationSeconds -= take;
      toTrim -= take;
    }
  }

  const nextSessions: TrackedSession[] = [];
  for (const s of sessions) {
    const wins = s.windows.filter((w) => w.durationSeconds > 0);
    if (!wins.length) continue;
    const st = wins.reduce((a, w) => a + w.durationSeconds, 0);
    nextSessions.push({ day: s.day, totalSeconds: st, windows: wins });
  }

  let sum = nextSessions.reduce((a, s) => a + s.totalSeconds, 0);
  if (sum !== target) {
    if (!nextSessions.length) {
      return optimisticTimeTrackedValue(undefined, taskId, target, tz);
    }
    const newestDay = nextSessions[0];
    const lastW = newestDay.windows[newestDay.windows.length - 1];
    lastW.durationSeconds = Math.max(
      0,
      lastW.durationSeconds + (target - sum),
    );
    newestDay.totalSeconds = newestDay.windows.reduce(
      (a, w) => a + w.durationSeconds,
      0,
    );
    sum = nextSessions.reduce((a, s) => a + s.totalSeconds, 0);
  }

  return { totalSeconds: target, sessions: nextSessions };
}

function findTaskRowInLocalStore(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
):
  | {
      userId: Id<"users">;
      name?: string;
      trackableId?: Id<"trackables">;
    }
  | undefined {
  type R = {
    _id: Id<"tasks">;
    userId?: Id<"users">;
    name?: string;
    trackableId?: Id<"trackables">;
  };
  const scan = (tasks: unknown[] | undefined) =>
    tasks?.find((t) => (t as R)._id === taskId) as R | undefined;

  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const hit = scan(q.value as unknown[]);
    if (hit?.userId) {
      return {
        userId: hit.userId,
        name: hit.name,
        trackableId: hit.trackableId,
      };
    }
  }
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const hit = scan(q.value as unknown[]);
    if (hit?.userId) {
      return {
        userId: hit.userId,
        name: hit.name,
        trackableId: hit.trackableId,
      };
    }
  }
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const hit = scan(q.value as unknown[]);
    if (hit?.userId) {
      return {
        userId: hit.userId,
        name: hit.name,
        trackableId: hit.trackableId,
      };
    }
  }
  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value as
      | { sections?: { tasks: unknown[] }[] }
      | undefined;
    if (!page?.sections) continue;
    for (const s of page.sections) {
      const hit = scan(s.tasks);
      if (hit?.userId) {
        return {
          userId: hit.userId,
          name: hit.name,
          trackableId: hit.trackableId,
        };
      }
    }
  }
  return undefined;
}

function removeManualOptimisticFromTimeWindowSearch(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
): void {
  const oid = optimisticManualTimeSpentWindowId(taskId);
  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const prev = (q.value ?? []) as TimeWindowSearchRow[];
    if (!prev.some((w) => w._id === oid)) continue;
    const next = prev.filter((w) => w._id !== oid);
    localStore.setQuery(api.timeWindows.search, q.args, next);
  }
}

function patchTimeWindowsSearchForManualIncrease(
  localStore: OptimisticLocalStore,
  params: {
    taskId: Id<"tasks">;
    timeZone: string;
    deltaSeconds: number;
  },
): void {
  const floored = Math.max(0, Math.floor(params.deltaSeconds));
  if (floored <= 0) return;

  const task = findTaskRowInLocalStore(localStore, params.taskId);
  if (!task?.userId) return;

  const tz = params.timeZone.trim() || "UTC";
  const nowMs = Date.now();
  const startMs = nowMs - floored * 1000;
  const wall = wallClockInTimeZone(startMs, tz);
  const oid = optimisticManualTimeSpentWindowId(params.taskId);
  const label =
    typeof task.name === "string" && task.name.trim().length > 0
      ? task.name.trim()
      : "Task";

  const endWall = wallClockInTimeZone(nowMs, tz);
  const minDay =
    wall.startDayYYYYMMDD <= endWall.startDayYYYYMMDD
      ? wall.startDayYYYYMMDD
      : endWall.startDayYYYYMMDD;
  const maxDay =
    wall.startDayYYYYMMDD >= endWall.startDayYYYYMMDD
      ? wall.startDayYYYYMMDD
      : endWall.startDayYYYYMMDD;

  const row = {
    _id: oid,
    _creationTime: nowMs,
    startTimeHHMM: wall.startTimeHHMM,
    startDayYYYYMMDD: wall.startDayYYYYMMDD,
    startTimeEpochMs: startMs,
    durationSeconds: floored,
    userId: task.userId,
    budgetType: "ACTUAL" as const,
    activityType: "TASK" as const,
    taskId: params.taskId,
    trackableId: task.trackableId,
    timeZone: tz,
    isRecurringInstance: false,
    source: "manual" as const,
    displayTitle: label,
    derivedTitle: label,
    displayColor: DEFAULT_EVENT_COLOR,
    secondaryColor: undefined,
  } satisfies Partial<TimeWindowSearchRow>;

  const mergedSort = (
    xs: TimeWindowSearchRow[],
  ): TimeWindowSearchRow[] =>
    [...xs].sort((a, b) => {
      const ae = a.startTimeEpochMs;
      const be = b.startTimeEpochMs;
      if (ae != null && be != null) return ae - be;
      if (ae != null) return -1;
      if (be != null) return 1;
      return String(a.startTimeHHMM).localeCompare(String(b.startTimeHHMM));
    });

  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const args = q.args as {
      startDay?: string;
      endDay?: string;
      taskId?: Id<"tasks">;
      trackableId?: Id<"trackables">;
      budgetType?: string;
      activityType?: string;
    };
    if (typeof args.startDay !== "string" || typeof args.endDay !== "string") {
      continue;
    }
    if (args.startDay > maxDay || args.endDay < minDay) continue;
    if (args.budgetType != null && args.budgetType !== "ACTUAL") continue;
    if (args.activityType != null && args.activityType !== "TASK") continue;
    if (args.trackableId != null) continue;
    if (args.taskId != null && args.taskId !== params.taskId) continue;

    const prev = (q.value ?? []) as TimeWindowSearchRow[];
    const without = prev.filter((w) => w._id !== oid);
    const next = mergedSort([...without, row as TimeWindowSearchRow]);
    localStore.setQuery(api.timeWindows.search, q.args, next);
  }
}

/**
 * Applies `tasks.setTimeSpent` optimistic cache patches using an **absolute** target
 * for `timeSpentInSecondsUnallocated` (and mirrored `getTimeTracked` shape).
 */
export function applySetTimeSpentOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: {
    taskId: Id<"tasks">;
    timeSpentInSecondsUnallocated: number;
    clientCalendarTimeZone?: string;
  },
): void {
  const tzArg = validatedOptionalIANATimeZone(
    typeof args.clientCalendarTimeZone === "string"
      ? args.clientCalendarTimeZone
      : undefined,
  );
  const tz =
    tzArg ??
    (typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone.trim() || "UTC"
      : "UTC");

  let strippedSnapshot: TimeTrackedValue | undefined;
  for (const q of localStore.getAllQueries(api.tasks.getTimeTracked)) {
    if (q.args.taskId !== args.taskId) continue;
    strippedSnapshot = stripManualOptimisticFromTracked(
      q.value as TimeTrackedValue | undefined,
      args.taskId,
    );
    break;
  }
  const currentSum = strippedSnapshot?.totalSeconds ?? 0;
  const target = Math.max(0, Math.floor(args.timeSpentInSecondsUnallocated));
  const calendarDelta = target - currentSum;

  removeManualOptimisticFromTimeWindowSearch(localStore, args.taskId);

  patchTaskTimeSpentCaches(localStore, args.taskId, {
    mode: "absolute",
    nextSeconds: args.timeSpentInSecondsUnallocated,
    timeZone: tz,
  });

  if (calendarDelta > 0) {
    patchTimeWindowsSearchForManualIncrease(localStore, {
      taskId: args.taskId,
      timeZone: tz,
      deltaSeconds: calendarDelta,
    });
  }
}

/**
 * Adds `deltaSeconds` to cached task time for list/search/paginated rows and to
 * `getTimeTracked.totalSeconds`, without assuming a single source of truth (each
 * subscription updates from its own previous snapshot). Used when stopping a task
 * timer so the play icon and duration do not flicker while waiting for the server.
 */
export function applyTimeSpentDeltaOptimisticUpdate(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  deltaSeconds: number,
): void {
  if (deltaSeconds <= 0) return;
  const tz =
    typeof Intl !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";
  patchTaskTimeSpentCaches(localStore, taskId, {
    mode: "delta",
    deltaSeconds,
    timeZone: tz,
  });
}

function patchTaskTimeSpentCaches(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  spec:
    | { mode: "absolute"; nextSeconds: number; timeZone: string }
    | { mode: "delta"; deltaSeconds: number; timeZone: string },
): void {
  const nextForRow = (
    rowSeconds: number | undefined,
  ): number => {
    if (spec.mode === "absolute") return spec.nextSeconds;
    return Math.max(0, Math.floor((rowSeconds ?? 0) + spec.deltaSeconds));
  };

  const nextForTimeTracked = (
    prev: TimeTrackedValue | undefined,
  ): TimeTrackedValue => {
    const tz = spec.timeZone;
    if (spec.mode === "absolute") {
      return optimisticTimeTrackedValue(
        prev,
        taskId,
        spec.nextSeconds,
        tz,
      );
    }
    const target = Math.max(
      0,
      Math.floor((prev?.totalSeconds ?? 0) + spec.deltaSeconds),
    );
    return optimisticTimeTrackedValue(prev, taskId, target, tz);
  };

  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === taskId);
    if (idx === -1) continue;
    const next = [...value];
    const row = value[idx];
    next[idx] = {
      ...row,
      timeSpentInSecondsUnallocated: nextForRow(
        row.timeSpentInSecondsUnallocated,
      ),
    };
    localStore.setQuery(api.tasks.getHomeTasks, q.args, next);
  }

  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === taskId);
    if (idx === -1) continue;
    const next = [...value];
    const row = value[idx];
    next[idx] = {
      ...row,
      timeSpentInSecondsUnallocated: nextForRow(
        row.timeSpentInSecondsUnallocated,
      ),
    };
    localStore.setQuery(api.tasks.searchWithCriteria, q.args, next);
  }

  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === taskId);
    if (idx === -1) continue;
    const next = [...value];
    const row = value[idx];
    next[idx] = {
      ...row,
      timeSpentInSecondsUnallocated: nextForRow(
        row.timeSpentInSecondsUnallocated,
      ),
    };
    localStore.setQuery(api.tasks.search, q.args, next);
  }

  for (const q of localStore.getAllQueries(api.tasks.getTimeTracked)) {
    if (q.args.taskId !== taskId) continue;
    const prev = q.value as TimeTrackedValue | undefined;
    localStore.setQuery(
      api.tasks.getTimeTracked,
      q.args,
      nextForTimeTracked(prev) as FunctionReturnType<
        typeof api.tasks.getTimeTracked
      >,
    );
  }

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;
    let touched = false;
    const sections = page.sections.map((s) => {
      const idx = s.tasks.findIndex((t) => t._id === taskId);
      if (idx === -1) return s;
      touched = true;
      const tasks = [...s.tasks];
      const row = tasks[idx];
      tasks[idx] = {
        ...row,
        timeSpentInSecondsUnallocated: nextForRow(
          row.timeSpentInSecondsUnallocated,
        ),
      };
      return { ...s, tasks };
    });
    if (touched) {
      localStore.setQuery(api.lists.getPaginated, q.args, {
        ...page,
        sections,
      });
    }
  }
}
