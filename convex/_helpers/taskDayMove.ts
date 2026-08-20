import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/**
 * Reindex `fromDay`, splice the task into `toDay` at `newOrderIndex`, and
 * persist `taskDay` / `taskDayOrderIndex`. Shared by drag-move and
 * start-timer (overdue → today).
 */
export async function moveTaskBetweenDays(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
    newOrderIndex: number;
  },
): Promise<void> {
  const fromTasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).eq("taskDay", args.fromDay),
    )
    .collect();
  const fromSorted = fromTasks
    .filter((t) => t._id !== args.taskId)
    .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex);
  for (let i = 0; i < fromSorted.length; i++) {
    if (fromSorted[i].taskDayOrderIndex !== i) {
      await ctx.db.patch(fromSorted[i]._id, { taskDayOrderIndex: i });
    }
  }

  const toTasks = await ctx.db
    .query("tasks")
    .withIndex("by_user_day", (q) =>
      q.eq("userId", userId).eq("taskDay", args.toDay),
    )
    .collect();
  const toSorted = toTasks
    .filter((t) => t._id !== args.taskId)
    .sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex);
  const task = await ctx.db.get(args.taskId);
  if (!task) throw new Error("Task not found");
  toSorted.splice(args.newOrderIndex, 0, task);

  await ctx.db.patch(args.taskId, {
    taskDay: args.toDay,
    taskDayOrderIndex: args.newOrderIndex,
  });
  for (let i = 0; i < toSorted.length; i++) {
    if (toSorted[i]._id !== args.taskId && toSorted[i].taskDayOrderIndex !== i) {
      await ctx.db.patch(toSorted[i]._id, { taskDayOrderIndex: i });
    }
  }
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
  const newOrderIndex = todayTasks.filter((t) => t._id !== taskId).length;

  await moveTaskBetweenDays(ctx, userId, {
    taskId,
    fromDay,
    toDay: todayYYYYMMDD,
    newOrderIndex,
  });
}
