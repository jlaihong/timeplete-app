import type { Id } from "../convex/_generated/dataModel";

type TaskForTimerMove = {
  _id: Id<"tasks">;
  taskDay?: string;
  dateCompleted?: string;
  isRecurringInstance?: boolean;
};

/**
 * Productivity-one starts a timer by calling `moveTaskToDay(task, today)`
 * first. Home Overdue is incomplete + `taskDay < today`; recurring
 * instances keep their occurrence date.
 */
export function moveOverdueTaskToTodayOnTimerStart(
  moveBetweenDays: (args: {
    taskId: Id<"tasks">;
    fromDay: string;
    toDay: string;
    newOrderIndex: number;
  }) => unknown,
  task: TaskForTimerMove | undefined,
  allTasks: { _id: Id<"tasks">; taskDay?: string }[],
  todayYYYYMMDD: string,
): void {
  if (!task) return;
  const fromDay = task.taskDay;
  if (!fromDay || fromDay >= todayYYYYMMDD) return;
  if (task.dateCompleted) return;
  if (task.isRecurringInstance) return;

  const newOrderIndex = allTasks.filter(
    (t) => t.taskDay === todayYYYYMMDD && t._id !== task._id,
  ).length;

  void moveBetweenDays({
    taskId: task._id,
    fromDay,
    toDay: todayYYYYMMDD,
    newOrderIndex,
  });
}
