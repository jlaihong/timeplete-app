import type { Id } from "../convex/_generated/dataModel";
import { maxOrderPlusOne } from "../convex/_helpers/orderShift";

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
    toIndex: number;
  }) => unknown,
  task: TaskForTimerMove | undefined,
  allTasks: { _id: Id<"tasks">; taskDay?: string; taskDayOrderIndex?: number }[],
  todayYYYYMMDD: string,
): void {
  if (!task) return;
  const fromDay = task.taskDay;
  if (!fromDay || fromDay >= todayYYYYMMDD) return;
  if (task.dateCompleted) return;
  if (task.isRecurringInstance) return;

  const toIndex = maxOrderPlusOne(
    allTasks
      .filter((t) => t.taskDay === todayYYYYMMDD && t._id !== task._id)
      .map((t) => t.taskDayOrderIndex),
  );

  void moveBetweenDays({
    taskId: task._id,
    fromDay,
    toDay: todayYYYYMMDD,
    toIndex,
  });
}
