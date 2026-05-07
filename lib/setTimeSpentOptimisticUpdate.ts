/**
 * Synchronously patches Convex query caches when task time-spent changes:
 * - `tasks.setTimeSpent` (absolute target)
 * - `timers.stop` via {@link applyTimeSpentDeltaOptimisticUpdate} (additive slice)
 */
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { todayYYYYMMDD } from "./dates";

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

function optimisticTimeTrackedValue(
  prev: TimeTrackedValue | undefined,
  targetTotal: number,
): TimeTrackedValue {
  const target = Math.max(0, Math.floor(targetTotal));
  if (target === 0) return { totalSeconds: 0, sessions: [] };
  if (!prev?.sessions.length) {
    const day = todayYYYYMMDD();
    return {
      totalSeconds: target,
      sessions: [
        {
          day,
          totalSeconds: target,
          windows: [
            {
              id: "__optimistic__",
              startTime: "00:00",
              durationSeconds: target,
            },
          ],
        },
      ],
    };
  }

  const sessions: TrackedSession[] = prev.sessions.map((s) => ({
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
    return optimisticTimeTrackedValue(undefined, target);
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
    const newest = refs[0];
    sessions[newest.sIdx].windows[newest.wIdx].durationSeconds += delta;
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
      return optimisticTimeTrackedValue(undefined, target);
    }
    const newestDay = nextSessions[0];
    const lastW = newestDay.windows[newestDay.windows.length - 1];
    lastW.durationSeconds = Math.max(0, lastW.durationSeconds + (target - sum));
    newestDay.totalSeconds = newestDay.windows.reduce(
      (a, w) => a + w.durationSeconds,
      0,
    );
    sum = nextSessions.reduce((a, s) => a + s.totalSeconds, 0);
  }

  return { totalSeconds: target, sessions: nextSessions };
}

/**
 * Applies `tasks.setTimeSpent` optimistic cache patches using an **absolute** target
 * for `timeSpentInSecondsUnallocated` (and mirrored `getTimeTracked` shape).
 */
export function applySetTimeSpentOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { taskId: Id<"tasks">; timeSpentInSecondsUnallocated: number },
): void {
  patchTaskTimeSpentCaches(localStore, args.taskId, {
    mode: "absolute",
    nextSeconds: args.timeSpentInSecondsUnallocated,
  });
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
  patchTaskTimeSpentCaches(localStore, taskId, {
    mode: "delta",
    deltaSeconds,
  });
}

function patchTaskTimeSpentCaches(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  spec:
    | { mode: "absolute"; nextSeconds: number }
    | { mode: "delta"; deltaSeconds: number },
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
    if (spec.mode === "absolute") {
      return optimisticTimeTrackedValue(prev, spec.nextSeconds);
    }
    const target = Math.max(
      0,
      Math.floor((prev?.totalSeconds ?? 0) + spec.deltaSeconds),
    );
    return optimisticTimeTrackedValue(prev, target);
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
