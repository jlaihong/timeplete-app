import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { compareTasksForDay } from "./compareTasksForDay";
import { applyTillEndShift } from "./orderShift";

/** Minimum shape the day-move math needs. Keeps the plan unit-testable. */
export type DayOrderedTask = {
  _id: string;
  taskDay?: string;
  taskDayOrderIndex?: number;
  dateCompleted?: string;
  _creationTime?: number;
};

export type TaskDayMovePlan = {
  /** New `taskDayOrderIndex` for rows displaced by the gap shift. */
  shifts: Array<{ _id: string; taskDayOrderIndex: number }>;
  /** Final placement of the moved task; `null` when the move is a no-op. */
  moved: { _id: string; taskDay: string; taskDayOrderIndex: number } | null;
};

/**
 * The home list sends the UI group id, and "overdue" / "unscheduled" are
 * buckets rather than days. The row's own `taskDay` is the real source day.
 */
export function resolveMoveFromDay(
  requestedFromDay: string,
  taskDay: string | undefined,
): string {
  if (requestedFromDay === "overdue" || requestedFromDay === "unscheduled") {
    return taskDay ?? requestedFromDay;
  }
  return requestedFromDay;
}

/**
 * Place the moved task directly above `insertAboveId` (or last when null)
 * and renumber both days to a dense 0..n-1 in display order.
 *
 * Positional rather than arithmetic because `taskDayOrderIndex` is not a
 * unique dense sequence in practice: the Supabase migration collapsed
 * missing indices to 0, so a day can read [0, 0, 2]. Gap-shifting to "the
 * drop target's stored index" then aims at a slot two rows share, and the
 * task lands on the first of them. Anchoring on the row's identity cannot
 * be ambiguous, and the renumber leaves the day dense afterwards, so a day
 * repairs itself the first time it is dragged.
 *
 * Costs the same as the gap shift: on an already-dense day both rewrite
 * exactly the rows between the old and new position.
 *
 * `tasks` must hold every row on `fromDay` and `toDay`, moved row included.
 */
function planPositionalDayMove<T extends DayOrderedTask>(args: {
  tasks: T[];
  moved: T;
  fromDay: string;
  toDay: string;
  insertAboveId: string | null;
}): TaskDayMovePlan {
  const taskId = args.moved._id;
  const dayRows = (day: string): T[] =>
    args.tasks
      .filter((t) => t.taskDay === day && t._id !== taskId)
      .sort(compareTasksForDay);

  const sameDay = args.fromDay === args.toDay;
  const fromRows = sameDay ? [] : dayRows(args.fromDay);
  const toRows = dayRows(args.toDay);

  let at = toRows.length;
  if (args.insertAboveId) {
    const found = toRows.findIndex((t) => t._id === args.insertAboveId);
    if (found >= 0) at = found;
  }

  const shifts: TaskDayMovePlan["shifts"] = [];
  const renumber = (rows: T[], skipAt: number | null): void => {
    let order = 0;
    for (let i = 0; i < rows.length; i++) {
      if (skipAt !== null && i === skipAt) order++;
      const row = rows[i];
      if ((row.taskDayOrderIndex ?? -1) !== order) {
        shifts.push({ _id: row._id, taskDayOrderIndex: order });
      }
      order++;
    }
  };
  renumber(toRows, at);
  if (!sameDay) renumber(fromRows, null);

  const unchanged =
    shifts.length === 0 &&
    args.moved.taskDay === args.toDay &&
    args.moved.taskDayOrderIndex === at;

  return {
    shifts,
    moved: unchanged
      ? null
      : { _id: taskId, taskDay: args.toDay, taskDayOrderIndex: at },
  };
}

/**
 * Gap-shift `taskDayOrderIndex` using the drop target's persisted index.
 * Matches productivity-backend `move_task_between_days`:
 *   decrement everyone on fromDay with order >= fromIndex
 *   increment everyone on toDay with order >= toIndex
 *   set the moved task to (toDay, toIndex)
 *
 * Only reached for a client that predates `insertAboveId` (a tab still on
 * the previous bundle). Inherits the duplicate-index ambiguity above.
 *
 * `tasks` must hold every row on `fromDay` and `toDay`, moved row included.
 */
export function planTaskDayMove<T extends DayOrderedTask>(args: {
  tasks: T[];
  taskId: string;
  /** Already resolved via `resolveMoveFromDay`. */
  fromDay: string;
  toDay: string;
  /**
   * Row the moved task lands above; `null` appends it last. Preferred over
   * `toIndex`, which cannot address a slot two rows share.
   */
  insertAboveId?: string | null;
  toIndex?: number;
}): TaskDayMovePlan {
  const byId = new Map<string, T>();
  for (const task of args.tasks) byId.set(task._id, task);

  const moved = byId.get(args.taskId);
  if (!moved) throw new Error("Task not found");

  if (args.insertAboveId !== undefined) {
    return planPositionalDayMove({
      tasks: args.tasks,
      moved,
      fromDay: args.fromDay,
      toDay: args.toDay,
      insertAboveId: args.insertAboveId,
    });
  }
  if (args.toIndex === undefined) {
    throw new Error("planTaskDayMove needs insertAboveId or toIndex");
  }
  const toIndex = args.toIndex;

  const fromIndex = moved.taskDayOrderIndex ?? 0;
  if (args.fromDay === args.toDay && fromIndex === toIndex) {
    return { shifts: [], moved: null };
  }

  const shifted = applyTillEndShift(
    [...byId.values()],
    (t) => t.taskDayOrderIndex ?? 0,
    (t, taskDayOrderIndex) => ({ ...t, taskDayOrderIndex }),
    fromIndex,
    toIndex,
    (t) => t._id === args.taskId,
    (t) => t.taskDay === args.fromDay,
    (t) => t.taskDay === args.toDay,
  );

  const shifts: TaskDayMovePlan["shifts"] = [];
  for (const next of shifted) {
    if (next._id === args.taskId) continue;
    const prev = byId.get(next._id);
    if (!prev) continue;
    if (next.taskDayOrderIndex !== prev.taskDayOrderIndex) {
      shifts.push({
        _id: next._id,
        taskDayOrderIndex: next.taskDayOrderIndex ?? 0,
      });
    }
  }

  return {
    shifts,
    moved: {
      _id: args.taskId,
      taskDay: args.toDay,
      taskDayOrderIndex: toIndex,
    },
  };
}

export async function moveTaskBetweenDays(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
    insertAboveId?: Id<"tasks"> | null;
    toIndex?: number;
  },
): Promise<void> {
  const task = await ctx.db.get(args.taskId);
  if (!task) throw new Error("Task not found");

  const fromDay = resolveMoveFromDay(args.fromDay, task.taskDay);

  const fromTasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).eq("taskDay", fromDay),
    )
    .collect();
  const toTasks =
    fromDay === args.toDay
      ? fromTasks
      : await ctx.db
          .query("tasks")
          .withIndex("by_user_day", (q) =>
            q.eq("userId", userId).eq("taskDay", args.toDay),
          )
          .collect();

  const plan = planTaskDayMove({
    tasks: [...fromTasks, ...toTasks],
    taskId: args.taskId,
    fromDay,
    toDay: args.toDay,
    insertAboveId: args.insertAboveId,
    toIndex: args.toIndex,
  });
  if (!plan.moved) return;

  for (const shift of plan.shifts) {
    await ctx.db.patch(shift._id as Id<"tasks">, {
      taskDayOrderIndex: shift.taskDayOrderIndex,
    });
  }

  await ctx.db.patch(args.taskId, {
    taskDay: plan.moved.taskDay,
    taskDayOrderIndex: plan.moved.taskDayOrderIndex,
  });
}

/**
 * Home Overdue = incomplete, non-recurring, `taskDay < today`. Starting a
 * timer on one of those tasks means the user is working it now, so park it
 * at the end of today (productivity-one `moveTaskToDay(task, today)`).
 *
 * Recurring instances keep their occurrence date — moving them would
 * collide with the `(recurringTaskId, taskDay)` identity.
 */
export async function moveOverdueTaskToTodayIfNeeded(
  ctx: MutationCtx,
  userId: Id<"users">,
  taskId: Id<"tasks">,
  todayYYYYMMDD: string,
): Promise<void> {
  const task = await ctx.db.get(taskId);
  if (!task || task.userId !== userId) return;

  const fromDay = task.taskDay;
  if (!fromDay || fromDay >= todayYYYYMMDD) return;
  if (task.dateCompleted) return;
  if (task.isRecurringInstance) return;

  await moveTaskBetweenDays(ctx, userId, {
    taskId,
    fromDay,
    toDay: todayYYYYMMDD,
    insertAboveId: null,
  });
}
