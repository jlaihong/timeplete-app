/**
 * Server-side gap shift, independent of any drag UI. Mirrors
 * productivity-backend `move_task_between_days`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  planTaskDayMove,
  resolveMoveFromDay,
  type DayOrderedTask,
} from "./taskDayMove";

const MONDAY = "2026-09-14";
const TUESDAY = "2026-09-15";

function day(taskDay: string, ids: string[]): DayOrderedTask[] {
  return ids.map((id, i) => ({ _id: id, taskDay, taskDayOrderIndex: i }));
}

/** Applies a plan and returns each day's ids in persisted order. */
function applyPlan(
  tasks: DayOrderedTask[],
  plan: ReturnType<typeof planTaskDayMove>,
): Record<string, string[]> {
  const next = tasks.map((task) => {
    const shift = plan.shifts.find((s) => s._id === task._id);
    if (shift) return { ...task, taskDayOrderIndex: shift.taskDayOrderIndex };
    if (plan.moved && task._id === plan.moved._id) {
      return {
        ...task,
        taskDay: plan.moved.taskDay,
        taskDayOrderIndex: plan.moved.taskDayOrderIndex,
      };
    }
    return task;
  });

  const out: Record<string, string[]> = {};
  for (const task of next) {
    const key = task.taskDay ?? "unscheduled";
    (out[key] ??= []).push(task._id);
  }
  for (const key of Object.keys(out)) {
    out[key].sort((a, b) => {
      const ao = next.find((t) => t._id === a)?.taskDayOrderIndex ?? 0;
      const bo = next.find((t) => t._id === b)?.taskDayOrderIndex ?? 0;
      return ao - bo;
    });
  }
  return out;
}

describe("resolveMoveFromDay", () => {
  it("swaps the overdue bucket for the row's real day", () => {
    assert.equal(resolveMoveFromDay("overdue", MONDAY), MONDAY);
    assert.equal(resolveMoveFromDay("unscheduled", MONDAY), MONDAY);
  });

  it("leaves a real day alone", () => {
    assert.equal(resolveMoveFromDay(MONDAY, TUESDAY), MONDAY);
  });
});

describe("planTaskDayMove", () => {
  it("opens a gap on the destination day and closes one on the source", () => {
    const tasks = [...day(MONDAY, ["X"]), ...day(TUESDAY, ["A", "B", "C"])];

    const plan = planTaskDayMove({
      tasks,
      taskId: "X",
      fromDay: MONDAY,
      toDay: TUESDAY,
      toIndex: 1,
    });

    assert.deepEqual(applyPlan(tasks, plan)[TUESDAY], ["A", "X", "B", "C"]);
  });

  it("reorders within a day without disturbing other days", () => {
    const tasks = [...day(MONDAY, ["P", "Q"]), ...day(TUESDAY, ["A", "B", "C"])];

    const plan = planTaskDayMove({
      tasks,
      taskId: "C",
      fromDay: TUESDAY,
      toDay: TUESDAY,
      toIndex: 1,
    });

    const result = applyPlan(tasks, plan);
    assert.deepEqual(result[TUESDAY], ["A", "C", "B"]);
    assert.deepEqual(result[MONDAY], ["P", "Q"]);
  });

  it("reports a no-op when the task is already at that index", () => {
    const tasks = day(TUESDAY, ["A", "B", "C"]);

    const plan = planTaskDayMove({
      tasks,
      taskId: "B",
      fromDay: TUESDAY,
      toDay: TUESDAY,
      toIndex: 1,
    });

    assert.equal(plan.moved, null);
    assert.deepEqual(plan.shifts, []);
  });

  it("appends when the index is past the end", () => {
    const tasks = [...day(MONDAY, ["X"]), ...day(TUESDAY, ["A", "B"])];

    const plan = planTaskDayMove({
      tasks,
      taskId: "X",
      fromDay: MONDAY,
      toDay: TUESDAY,
      toIndex: 2,
    });

    assert.deepEqual(applyPlan(tasks, plan)[TUESDAY], ["A", "B", "X"]);
  });
});
