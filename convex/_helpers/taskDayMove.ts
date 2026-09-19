import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { applyTillEndShift, maxOrderPlusOne } from "./orderShift";

/** Minimum shape the day-move math needs. Keeps the plan unit-testable. */
export type DayOrderedTask = {
  _id: string;
  taskDay?: string;
  taskDayOrderIndex?: number;
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
 * Gap-shift `taskDayOrderIndex` using the drop target's persisted index.
 * Matches productivity-backend `move_task_between_days`:
 *   decrement everyone on fromDay with order >= fromIndex
 *   increment everyone on toDay with order >= toIndex
 *   set the moved task to (toDay, toIndex)
 *
 * `tasks` must hold every row on `fromDay` and `toDay`, moved row included.
 */
export function planTaskDayMove<T extends DayOrderedTask>(args: {
  tasks: T[];
  taskId: string;
  /** Already resolved via `resolveMoveFromDay`. */
  fromDay: string;
  toDay: string;
  toIndex: number;
}): TaskDayMovePlan {
  const byId = new Map<string, T>();
  for (const task of args.tasks) byId.set(task._id, task);

  const moved = byId.get(args.taskId);
  if (!moved) throw new Error("Task not found");

  const fromIndex = moved.taskDayOrderIndex ?? 0;
  if (args.fromDay === args.toDay && fromIndex === args.toIndex) {
    return { shifts: [], moved: null };
  }

  const shifted = applyTillEndShift(
    [...byId.values()],
    (t) => t.taskDayOrderIndex ?? 0,
    (t, taskDayOrderIndex) => ({ ...t, taskDayOrderIndex }),
    fromIndex,
    args.toIndex,
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
      taskDayOrderIndex: args.toIndex,
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
    toIndex: number;
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

  const todayTasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).eq("taskDay", todayYYYYMMDD),
    )
    .collect();
  const toIndex = maxOrderPlusOne(
    todayTasks
      .filter((t) => t._id !== taskId)
      .map((t) => t.taskDayOrderIndex),
  );

  await moveTaskBetweenDays(ctx, userId, {
    taskId,
    fromDay,
    toDay: todayYYYYMMDD,
    toIndex,
  });
}
