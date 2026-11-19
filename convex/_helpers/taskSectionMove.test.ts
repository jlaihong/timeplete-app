/**
 * Section-move placement, independent of any drag UI.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  compareTasksForListView,
  planTaskSectionMove,
  type SectionOrderedTask,
} from "./taskSectionMove";

type Row = SectionOrderedTask & { section: string };

function row(
  id: string,
  section: string,
  sectionOrderIndex: number,
  extra: Partial<Row> = {},
): Row {
  return {
    _id: id,
    section,
    sectionOrderIndex,
    _creationTime: id.charCodeAt(0),
    ...extra,
  };
}

/** Applies a plan and returns each section's ids in display order. */
function applyPlan(
  tasks: Row[],
  plan: ReturnType<typeof planTaskSectionMove>,
): Record<string, string[]> {
  const next = tasks.map((task) => {
    if (plan.moved && task._id === plan.moved._id) {
      return {
        ...task,
        section: plan.moved.sectionId,
        sectionOrderIndex: plan.moved.sectionOrderIndex,
      };
    }
    const shift = plan.shifts.find((s) => s._id === task._id);
    return shift
      ? { ...task, sectionOrderIndex: shift.sectionOrderIndex }
      : task;
  });
  const out: Record<string, string[]> = {};
  for (const task of [...next].sort(compareTasksForListView)) {
    (out[task.section] ??= []).push(task._id);
  }
  return out;
}

function move(
  tasks: Row[],
  taskId: string,
  toSectionId: string,
  placement: { insertAboveId?: string | null; toIndex?: number },
) {
  const plan = planTaskSectionMove({
    tasks,
    taskId,
    sectionOf: (t) => t.section,
    toSectionId,
    ...placement,
  });
  return { plan, order: applyPlan(tasks, plan) };
}

describe("planTaskSectionMove", () => {
  it("moves the last row to the top when every index is 0", () => {
    const tasks = [row("A", "s", 0), row("B", "s", 0), row("C", "s", 0)];

    const { order } = move(tasks, "C", "s", { insertAboveId: "A" });

    assert.deepEqual(order.s, ["C", "A", "B"]);
  });

  it("the index-addressed move is a no-op on the same data", () => {
    const tasks = [row("A", "s", 0), row("B", "s", 0), row("C", "s", 0)];

    const { plan } = move(tasks, "C", "s", { toIndex: 0 });

    assert.equal(plan.moved, null);
  });

  it("lands between two rows that share an index", () => {
    const tasks = [
      row("A", "s", 0),
      row("B", "s", 0),
      row("C", "s", 2),
      row("D", "s", 3),
    ];

    const { order } = move(tasks, "D", "s", { insertAboveId: "B" });

    assert.deepEqual(order.s, ["A", "D", "B", "C"]);
  });

  it("appends when insertAboveId is null", () => {
    const tasks = [row("A", "s", 0), row("B", "s", 0), row("C", "s", 0)];

    const { order } = move(tasks, "A", "s", { insertAboveId: null });

    assert.deepEqual(order.s, ["B", "C", "A"]);
  });

  it("reports no move when the row is dropped where it was", () => {
    const tasks = [row("A", "s", 0), row("B", "s", 1), row("C", "s", 2)];

    const { plan } = move(tasks, "B", "s", { insertAboveId: "C" });

    assert.equal(plan.moved, null);
    assert.deepEqual(plan.shifts, []);
  });

  it("moves into another section above the named row", () => {
    const tasks = [
      row("A", "s", 0),
      row("B", "s", 1),
      row("X", "t", 0),
      row("Y", "t", 0),
    ];

    const { order } = move(tasks, "B", "t", { insertAboveId: "Y" });

    assert.deepEqual(order, { s: ["A"], t: ["X", "B", "Y"] });
  });

  it("leaves completed rows untouched", () => {
    const done = { dateCompleted: "2026-11-01" };
    const tasks = [
      row("A", "s", 0),
      row("B", "s", 1),
      row("C", "s", 2),
      row("P", "s", 0, done),
      row("Q", "s", 5, done),
    ];

    const { plan, order } = move(tasks, "C", "s", { insertAboveId: "A" });

    assert.deepEqual(order.s, ["C", "A", "B", "P", "Q"]);
    assert.ok(plan.shifts.every((s) => s._id !== "P" && s._id !== "Q"));
  });

  it("dropping above the first completed row lands last among incomplete", () => {
    const done = { dateCompleted: "2026-11-01" };
    const tasks = [
      row("A", "s", 0),
      row("B", "s", 0),
      row("C", "s", 0),
      row("P", "s", 0, done),
    ];

    const { order } = move(tasks, "A", "s", { insertAboveId: "P" });

    assert.deepEqual(order.s, ["B", "C", "A", "P"]);
  });
});
