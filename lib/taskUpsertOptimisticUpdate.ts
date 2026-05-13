/**
 * Optimistic Convex cache patches for `tasks.upsert` (creates + row edits).
 *
 * Mirrors `tasks.getHomeTasks` / `tasks.search*` / `lists.getPaginated` shapes so UI
 * updates immediately while mutations round-trip.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";

type HomeTaskRow = FunctionReturnType<
  typeof api.tasks.getHomeTasks
>[number];

type CriteriaTaskRow = FunctionReturnType<
  typeof api.tasks.searchWithCriteria
>[number];

type SearchTaskRow = FunctionReturnType<
  typeof api.tasks.search
>[number];

/** Mutable working row used while projecting optimistic stubs into cached queries. */
type TaskWorkRow =
  | HomeTaskRow
  | CriteriaTaskRow
  | SearchTaskRow;

export type UpsertTaskOptimisticArgs = {
  id?: Id<"tasks">;
  name: string;
  parentId?: Id<"tasks">;
  dateCompleted?: string | null;
  timeSpentInSecondsUnallocated?: number;
  timeEstimatedInSecondsUnallocated?: number;
  dueDateYYYYMMDD?: string;
  listId?: Id<"lists">;
  taskDay?: string;
  taskDayOrderIndex?: number;
  sectionId?: Id<"listSections">;
  sectionOrderIndex?: number;
  trackableId?: Id<"trackables"> | null;
  tagIds?: Id<"tags">[];
  assignedToUserId?: Id<"users">;
};

function isTaskCompletedForListViewRow(t: { dateCompleted?: string }): boolean {
  const d = t.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

function compareTasksForListView(
  a: { dateCompleted?: string; sectionOrderIndex: number },
  b: { dateCompleted?: string; sectionOrderIndex: number },
): number {
  const aDone = isTaskCompletedForListViewRow(a);
  const bDone = isTaskCompletedForListViewRow(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  return a.sectionOrderIndex - b.sectionOrderIndex;
}

function dayInRanges(
  day: string | undefined,
  ranges: { startDay: string; endDay: string }[],
): boolean {
  if (!day) return false;
  return ranges.some((r) => day >= r.startDay && day <= r.endDay);
}

function resemblesPendingUpsertInsert(
  t: TaskWorkRow,
  args: UpsertTaskOptimisticArgs,
): boolean {
  if (t.name !== args.name.trim()) return false;
  const aTd = args.taskDay;
  const tTd = t.taskDay ?? undefined;
  if (aTd !== undefined ? tTd !== aTd : tTd !== undefined && tTd !== "") {
    return false;
  }
  if (
    (args.parentId ?? undefined) !== (t.parentId ?? undefined) ||
    (args.listId ?? undefined) !== (t.listId ?? undefined)
  ) {
    return false;
  }
  const aTrack = args.trackableId ?? undefined;
  const tTrack = t.trackableId ?? undefined;
  if (aTrack !== tTrack) return false;

  let aCompleted: string | undefined;
  if (args.dateCompleted !== undefined && args.dateCompleted !== null) {
    aCompleted = args.dateCompleted;
  }
  const tCompleted = t.dateCompleted;
  return (aCompleted ?? undefined) === (tCompleted ?? undefined);
}

function shouldSkipSyntheticInsertDueToMergedServerRow(
  rows: TaskWorkRow[],
  args: UpsertTaskOptimisticArgs,
  optimisticId: Id<"tasks">,
): boolean {
  const nowMs = Date.now();
  const windowMs = 4000;
  return rows.some(
    (t) =>
      t._id !== optimisticId &&
      resemblesPendingUpsertInsert(t, args) &&
      typeof t._creationTime === "number" &&
      nowMs - t._creationTime >= 0 &&
      nowMs - t._creationTime < windowMs,
  );
}

function stableOptimisticCreateId(args: UpsertTaskOptimisticArgs): Id<"tasks"> {
  const key = JSON.stringify({
    name: args.name.trim(),
    taskDay: args.taskDay,
    listId: args.listId,
    sectionId: args.sectionId,
    parentId: args.parentId,
    trackableId: args.trackableId,
    tagIds: args.tagIds,
    tdOrder: args.taskDayOrderIndex,
    secOrder: args.sectionOrderIndex,
    dateCompleted: args.dateCompleted,
  });
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h << 5) - h + key.charCodeAt(i);
    h |= 0;
  }
  return `ooh${Math.abs(h).toString(36)}` as Id<"tasks">;
}

function patchTaskRow(
  existing: TaskWorkRow,
  args: UpsertTaskOptimisticArgs,
): TaskWorkRow {
  const patched: TaskWorkRow = { ...existing };
  if (args.name !== undefined) patched.name = args.name;
  if (args.dateCompleted !== undefined) {
    patched.dateCompleted = args.dateCompleted ?? undefined;
  }
  if (args.taskDay !== undefined) patched.taskDay = args.taskDay;
  if (args.taskDayOrderIndex !== undefined) {
    patched.taskDayOrderIndex = args.taskDayOrderIndex;
  }
  if (args.listId !== undefined) patched.listId = args.listId;
  if (args.sectionId !== undefined) patched.sectionId = args.sectionId;
  if (args.sectionOrderIndex !== undefined) {
    patched.sectionOrderIndex = args.sectionOrderIndex;
  }
  if (args.dueDateYYYYMMDD !== undefined) {
    patched.dueDateYYYYMMDD = args.dueDateYYYYMMDD;
  }
  if (args.timeSpentInSecondsUnallocated !== undefined) {
    patched.timeSpentInSecondsUnallocated = args.timeSpentInSecondsUnallocated;
  }
  if (args.timeEstimatedInSecondsUnallocated !== undefined) {
    patched.timeEstimatedInSecondsUnallocated =
      args.timeEstimatedInSecondsUnallocated;
  }
  if (args.trackableId !== undefined) {
    patched.trackableId = args.trackableId ?? undefined;
  }
  if (args.tagIds !== undefined) {
    (patched as { tagIds?: Id<"tags">[] }).tagIds = args.tagIds;
  }
  if (args.assignedToUserId !== undefined) {
    patched.assignedToUserId = args.assignedToUserId;
  }
  return patched;
}

function insertSortedHomeShape(
  value: HomeTaskRow[],
  row: HomeTaskRow,
): HomeTaskRow[] {
  const td = row.taskDayOrderIndex ?? 0;
  const idx = value.findIndex((t) => (t.taskDayOrderIndex ?? 0) > td);
  if (idx === -1) return [...value, row];
  return [...value.slice(0, idx), row, ...value.slice(idx)];
}

function syntheticInsertRow(args: UpsertTaskOptimisticArgs, id: Id<"tasks">) {
  const now = Date.now();
  const row = {
    _id: id,
    _creationTime: now,
    name: args.name.trim(),
    parentId: args.parentId,
    dateCompleted:
      typeof args.dateCompleted === "string" &&
      args.dateCompleted.trim().length > 0
        ? args.dateCompleted
        : undefined,
    timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated ?? 0,
    timeEstimatedInSecondsUnallocated:
      args.timeEstimatedInSecondsUnallocated ?? 0,
    dueDateYYYYMMDD: args.dueDateYYYYMMDD,
    listId: args.listId,
    taskDay: args.taskDay,
    taskDayOrderIndex: args.taskDayOrderIndex ?? 0,
    sectionId: args.sectionId ?? undefined,
    sectionOrderIndex: args.sectionOrderIndex ?? 0,
    trackableId: args.trackableId ?? undefined,
    recurringTaskId: undefined,
    seriesId: undefined,
    isRecurringInstance: false,
    isException: undefined,
    originalTaskDay: undefined,
    userId: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzg" as Id<"users">,
    createdBy: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzg" as Id<"users">,
    assignedToUserId: args.assignedToUserId,
    legacyId: undefined,
    rootTaskId: args.parentId ? undefined : id,
    tagIds: args.tagIds ?? [],
  } as unknown as HomeTaskRow;
  return row;
}

function belongsInHomeQuery(
  taskDay: string | undefined,
  args: UpsertTaskOptimisticArgs,
  clockToday: string,
  rangeEnd: string,
): boolean {
  if (!taskDay) return false;

  const rawCompleted = args.dateCompleted;
  const incomplete =
    rawCompleted === undefined ||
    rawCompleted === null ||
    rawCompleted === "";

  const completionDayYYYYMMDD =
    typeof rawCompleted === "string" &&
    rawCompleted.trim().length > 0
      ? rawCompleted
      : undefined;

  const overdue = incomplete && taskDay < clockToday;

  const inRangeWindow =
    incomplete && taskDay >= clockToday && taskDay <= rangeEnd;

  const completedShowsInPrimaryWindow =
    completionDayYYYYMMDD !== undefined &&
    completionDayYYYYMMDD >= clockToday &&
    completionDayYYYYMMDD <= rangeEnd;

  return overdue || inRangeWindow || completedShowsInPrimaryWindow;
}

/** Call from `useMutation(api.tasks.upsert).withOptimisticUpdate(...)`. */
export function applyTaskUpsertOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: UpsertTaskOptimisticArgs,
): void {
  if (args.id) {
    applyUpsertPatches(localStore, args, args.id);
    return;
  }

  applyOptimisticCreates(localStore, args);
}

function applyUpsertPatches(
  localStore: OptimisticLocalStore,
  args: UpsertTaskOptimisticArgs,
  rowId: Id<"tasks">,
): void {
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === rowId);
    if (idx === -1) continue;
    const next = [...value];
    next[idx] = patchTaskRow(value[idx], args) as HomeTaskRow;
    localStore.setQuery(
      api.tasks.getHomeTasks,
      q.args,
      next as FunctionReturnType<typeof api.tasks.getHomeTasks>,
    );
  }

  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === rowId);
    if (idx === -1) continue;
    const next = [...value];
    next[idx] = patchTaskRow(value[idx], args) as CriteriaTaskRow;
    localStore.setQuery(
      api.tasks.searchWithCriteria,
      q.args,
      next as FunctionReturnType<typeof api.tasks.searchWithCriteria>,
    );
  }

  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const value = q.value;
    if (!value) continue;
    const idx = value.findIndex((t) => t._id === rowId);
    if (idx === -1) continue;
    const next = [...value];
    next[idx] = patchTaskRow(value[idx], args) as SearchTaskRow;
    localStore.setQuery(
      api.tasks.search,
      q.args,
      next as FunctionReturnType<typeof api.tasks.search>,
    );
  }

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    const page = q.value;
    if (!page) continue;
    let touched = false;
    const sections = page.sections.map((s) => {
      const idx = s.tasks.findIndex((t) => t._id === rowId);
      if (idx === -1) return s;
      touched = true;
      const tasks = [...s.tasks];
      tasks[idx] = patchTaskRow(
        tasks[idx] as unknown as TaskWorkRow,
        args,
      ) as (typeof tasks)[number];
      return { ...s, tasks };
    });
    if (touched) {
      localStore.setQuery(
        api.lists.getPaginated,
        q.args,
        { ...page, sections } as FunctionReturnType<
          typeof api.lists.getPaginated
        >,
      );
    }
  }
}

function applyOptimisticCreates(
  localStore: OptimisticLocalStore,
  args: UpsertTaskOptimisticArgs,
): void {
  const optimisticId = stableOptimisticCreateId(args);

  /* ─── getHomeTasks ─── */
  for (const q of localStore.getAllQueries(api.tasks.getHomeTasks)) {
    const value = q.value;
    if (!value) continue;

    let next = value.filter((t) => t._id !== optimisticId);
    const taskDay = args.taskDay;
    const clockToday = q.args.todayYYYYMMDD;
    const rangeEnd = q.args.rangeEndYYYYMMDD;
    const include =
      taskDay !== undefined &&
      belongsInHomeQuery(taskDay, args, clockToday, rangeEnd) &&
      !shouldSkipSyntheticInsertDueToMergedServerRow(
        next as TaskWorkRow[],
        args,
        optimisticId,
      );

    let changed = next.length !== value.length;
    if (include) {
      changed = true;
      next = insertSortedHomeShape(
        next as HomeTaskRow[],
        syntheticInsertRow(args, optimisticId),
      );
    }
    if (changed) {
      localStore.setQuery(
        api.tasks.getHomeTasks,
        q.args,
        next as FunctionReturnType<typeof api.tasks.getHomeTasks>,
      );
    }
  }

  /* ─── searchWithCriteria ─── */
  for (const q of localStore.getAllQueries(api.tasks.searchWithCriteria)) {
    const value = q.value;
    if (!value) continue;
    let next = value.filter((t) => t._id !== optimisticId);

    const td = args.taskDay;
    const mergedServer = shouldSkipSyntheticInsertDueToMergedServerRow(
      next as TaskWorkRow[],
      args,
      optimisticId,
    );

    let shouldInsert = false;
    if (td && dayInRanges(td, q.args.dayRanges) && !mergedServer) {
      shouldInsert = true;
    }
    const dcRaw = args.dateCompleted;
    const completedSupplementEligible =
      typeof dcRaw === "string" &&
      q.args.includeCompleted &&
      !!q.args.completedStartDay &&
      !!q.args.completedEndDay &&
      dcRaw >= q.args.completedStartDay &&
      dcRaw <= q.args.completedEndDay &&
      !!td &&
      !dayInRanges(td, q.args.dayRanges);

    if (completedSupplementEligible && !mergedServer) {
      shouldInsert = true;
    }

    const changedStrip = next.length !== value.length;
    if (!shouldInsert) {
      if (changedStrip) {
        localStore.setQuery(
          api.tasks.searchWithCriteria,
          q.args,
          next as FunctionReturnType<typeof api.tasks.searchWithCriteria>,
        );
      }
      continue;
    }

    const row = syntheticInsertRow(args, optimisticId);
    next = [...next, row].sort(
      (a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0),
    );
    localStore.setQuery(
      api.tasks.searchWithCriteria,
      q.args,
      next as FunctionReturnType<typeof api.tasks.searchWithCriteria>,
    );
  }

  /* ─── tasks.search ─── */
  for (const q of localStore.getAllQueries(api.tasks.search)) {
    const value = q.value;
    if (!value) continue;
    let next = value.filter((t) => t._id !== optimisticId);
    if (
      shouldSkipSyntheticInsertDueToMergedServerRow(
        next as TaskWorkRow[],
        args,
        optimisticId,
      )
    ) {
      if (next.length !== value.length) {
        localStore.setQuery(
          api.tasks.search,
          q.args,
          next as FunctionReturnType<typeof api.tasks.search>,
        );
      }
      continue;
    }
    const row = syntheticInsertRow(args, optimisticId);
    next = [...next, row].sort(
      (a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0),
    );
    localStore.setQuery(
      api.tasks.search,
      q.args,
      next as FunctionReturnType<typeof api.tasks.search>,
    );
  }

  /* ─── lists.getPaginated ───
   * Only when the client knows the section (server otherwise picks the list default). */
  if (!args.listId || !args.sectionId) return;

  for (const q of localStore.getAllQueries(api.lists.getPaginated)) {
    if (q.args.listId !== args.listId) continue;
    const page = q.value;
    if (!page) continue;

    let pageTouched = false;

    const sections = page.sections.map((sec) => {
      if (sec.section._id !== args.sectionId) return sec;

      let tasks = sec.tasks.filter((t) => t._id !== optimisticId);
      if (
        shouldSkipSyntheticInsertDueToMergedServerRow(
          tasks as unknown as TaskWorkRow[],
          args,
          optimisticId,
        )
      ) {
        if (tasks.length !== sec.tasks.length) pageTouched = true;
        return { ...sec, tasks };
      }

      const row = syntheticInsertRow(args, optimisticId);
      const asRows = [...tasks, row as (typeof tasks)[number]];
      const sorted = [...asRows].sort(compareTasksForListView);
      const incomplete = sorted.filter((t) => !isTaskCompletedForListViewRow(t));
      const complete = sorted.filter((t) => isTaskCompletedForListViewRow(t));
      const taskLim = q.args.taskLimit ?? 2500;
      const pageTasks = [...incomplete.slice(0, taskLim), ...complete];

      pageTouched = true;
      return {
        ...sec,
        tasks: pageTasks,
        totalTasks: sec.totalTasks + 1,
      };
    });

    if (pageTouched) {
      localStore.setQuery(
        api.lists.getPaginated,
        q.args,
        { ...page, sections } as FunctionReturnType<
          typeof api.lists.getPaginated
        >,
      );
    }
  }
}
