/**
 * Optimistic `timers.get` patch when starting a task or trackable timer.
 */
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { applyStopTimerOptimisticUpdate } from "./stopTimerOptimisticUpdate";
import { applyMoveBetweenDaysOptimisticUpdate } from "./taskMoveOptimisticUpdate";
import { wallClockInTimeZone } from "./wallClockTimeZone";

type TimerRow = NonNullable<FunctionReturnType<typeof api.timers.get>>;

function patchTimersGet(
  localStore: OptimisticLocalStore,
  next: TimerRow | null,
): void {
  for (const q of localStore.getAllQueries(api.timers.get)) {
    localStore.setQuery(api.timers.get, q.args, next);
  }
}

function baseOptimisticTimer(args: {
  userId: Id<"users">;
  timeZone: string;
  taskId?: Id<"tasks">;
  trackableId?: Id<"trackables">;
  displayTitle?: string;
  displayColor?: string;
}): TimerRow {
  const now = Date.now();
  return {
    _id: `__optimistic_timer__` as Id<"taskTimers">,
    _creationTime: now,
    userId: args.userId,
    taskId: args.taskId,
    trackableId: args.trackableId,
    timeZone: args.timeZone,
    startTime: now,
    displayTitle: args.displayTitle,
    displayColor: args.displayColor,
    secondaryColor: undefined,
  } as TimerRow;
}

function viewerUserId(localStore: OptimisticLocalStore): Id<"users"> | null {
  for (const q of localStore.getAllQueries(api.timers.get)) {
    if (q.value?.userId) return q.value.userId as Id<"users">;
  }
  for (const q of localStore.getAllQueries(api.users.getProfile)) {
    if (q.value?._id) return q.value._id as Id<"users">;
  }
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const row = q.value?.[0];
    if (row?.userId) return row.userId as Id<"users">;
  }
  return null;
}

type CachedTaskRow = {
  _id: Id<"tasks">;
  taskDay?: string;
  taskDayOrderIndex?: number;
  dateCompleted?: string;
  isRecurringInstance?: boolean;
};

function findCachedTask(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
): CachedTaskRow | null {
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const row = q.value?.find((t) => t._id === taskId);
    if (row) return row;
  }
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const row = q.value?.find((t) => t._id === taskId);
    if (row) return row;
  }
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const row = q.value?.find((t) => t._id === taskId);
    if (row) return row;
  }
  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    for (const sec of q.value?.sections ?? []) {
      const row = sec.tasks.find((t) => t._id === taskId);
      if (row) return row;
    }
  }
  return null;
}

function nextOrderIndexForDay(
  localStore: OptimisticLocalStore,
  day: string,
  excludeTaskId: Id<"tasks">,
): number {
  const ids = new Set<Id<"tasks">>();
  const consider = (rows: CachedTaskRow[] | undefined) => {
    for (const t of rows ?? []) {
      if (t._id === excludeTaskId) continue;
      if (t.taskDay === day) ids.add(t._id);
    }
  };
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    consider(q.value);
  }
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    consider(q.value);
  }
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    consider(q.value);
  }
  return ids.size;
}

function patchListTaskDay(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  toDay: string,
  newOrderIndex: number,
): void {
  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;
    let found = false;
    const sections = page.sections.map((sec) => {
      let sectionFound = false;
      const tasks = sec.tasks.map((t) => {
        if (t._id !== taskId) return t;
        sectionFound = true;
        found = true;
        return { ...t, taskDay: toDay, taskDayOrderIndex: newOrderIndex };
      });
      return sectionFound ? { ...sec, tasks } : sec;
    });
    if (found) {
      localStore.setQuery(api.lists.getPaginated, q.args, {
        ...page,
        sections,
      });
    }
  }
}

/**
 * Mirror `moveOverdueTaskToTodayIfNeeded`: incomplete, non-recurring,
 * `taskDay < today` → append onto today so Overdue doesn't flash.
 */
function moveOverdueTaskToTodayOptimistic(
  localStore: OptimisticLocalStore,
  taskId: Id<"tasks">,
  timeZone: string,
): void {
  const task = findCachedTask(localStore, taskId);
  const fromDay = task?.taskDay;
  if (!task || !fromDay) return;
  if (task.dateCompleted) return;
  if (task.isRecurringInstance) return;

  const today = wallClockInTimeZone(Date.now(), timeZone).startDayYYYYMMDD;
  if (fromDay >= today) return;

  const newOrderIndex = nextOrderIndexForDay(localStore, today, taskId);
  applyMoveBetweenDaysOptimisticUpdate(localStore, {
    taskId,
    fromDay,
    toDay: today,
    newOrderIndex,
  });
  patchListTaskDay(localStore, taskId, today, newOrderIndex);
}

export function applyStartTaskTimerOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { taskId: Id<"tasks">; timeZone: string },
): void {
  moveOverdueTaskToTodayOptimistic(localStore, args.taskId, args.timeZone);

  // Starting replaces any running timer — finalize the old one locally first.
  let hadRunning = false;
  for (const q of localStore.getAllQueries(api.timers.get)) {
    if (q.value) {
      hadRunning = true;
      break;
    }
  }
  if (hadRunning) {
    applyStopTimerOptimisticUpdate(localStore);
  }

  let displayTitle: string | undefined;
  let displayColor: string | undefined;
  let userId = viewerUserId(localStore);

  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const row = q.value?.find((t) => t._id === args.taskId);
    if (row) {
      displayTitle = row.name;
      userId = userId ?? (row.userId as Id<"users">);
      break;
    }
  }
  if (!displayTitle) {
    for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
      for (const sec of q.value?.sections ?? []) {
        const row = sec.tasks.find((t) => t._id === args.taskId);
        if (row) {
          displayTitle = row.name;
          userId = userId ?? (row.userId as Id<"users">);
          break;
        }
      }
      if (displayTitle) break;
    }
  }

  if (!userId) return;

  patchTimersGet(
    localStore,
    baseOptimisticTimer({
      userId,
      timeZone: args.timeZone,
      taskId: args.taskId,
      displayTitle: displayTitle ?? "Task",
      displayColor,
    }),
  );
}

export function applyStartTrackableTimerOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: { trackableId: Id<"trackables">; timeZone: string },
): void {
  let hadRunning = false;
  for (const q of localStore.getAllQueries(api.timers.get)) {
    if (q.value) {
      hadRunning = true;
      break;
    }
  }
  if (hadRunning) {
    applyStopTimerOptimisticUpdate(localStore);
  }

  let displayTitle: string | undefined;
  let displayColor: string | undefined;
  const userId = viewerUserId(localStore);
  for (const q of localStore.getAllQueries(api.trackables.search)) {
    const row = q.value?.find((t) => t._id === args.trackableId);
    if (row) {
      displayTitle = row.name;
      displayColor = row.colour;
      break;
    }
  }
  if (!userId) return;

  patchTimersGet(
    localStore,
    baseOptimisticTimer({
      userId,
      timeZone: args.timeZone,
      trackableId: args.trackableId,
      displayTitle: displayTitle ?? "Trackable",
      displayColor,
    }),
  );
}
