/**
 * Home-list drag regressions. Each case is a bug that shipped at least once,
 * named after what the user saw. The assertions are on the day's rendered
 * order after the mutation, so they stay honest if the index math changes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  OVERDUE_GROUP_ID,
  simulateDrag,
  tasksOnDay,
  type SimTask,
} from "./homeTaskDragSimulator";
import { applyHoverTransfer, resolveTaskDropIndex } from "./taskDragReorder";

const TODAY = "2026-09-19";
const YESTERDAY = "2026-09-18";

/** Overdue task X above today's A, B, C. */
function overdueAndToday(): SimTask[] {
  return [
    { _id: "X", taskDay: YESTERDAY, taskDayOrderIndex: 0 },
    ...tasksOnDay(TODAY, ["A", "B", "C"]),
  ];
}

describe("dragging an overdue task into today", () => {
  it("lands second when dropped on the second row", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        // Enters today over A, then the pointer moves down to A's row in the
        // spliced list, which is the second slot.
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        drop: { groupId: TODAY, overTaskId: "A" },
      },
    );

    assert.deepEqual(result.order[TODAY], ["A", "X", "B", "C"]);
    assert.equal(result.order[OVERDUE_GROUP_ID], undefined);
  });

  it("lands third when dropped on the third row", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        drop: { groupId: TODAY, overTaskId: "B" },
      },
    );

    assert.deepEqual(result.order[TODAY], ["A", "B", "X", "C"]);
  });

  it("lands first when dropped on the row it entered above", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        // Pointer still on the preview row itself.
        drop: { groupId: TODAY, overTaskId: null },
      },
    );

    assert.deepEqual(result.order[TODAY], ["X", "A", "B", "C"]);
  });

  it("lands last when dropped past the final row", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "C", insertAfterOver: true }],
        drop: { groupId: TODAY, overTaskId: null },
      },
    );

    assert.deepEqual(result.order[TODAY], ["A", "B", "C", "X"]);
  });

  it("lands last when dropped on an empty day's container", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [],
        drop: { groupId: TODAY, overTaskId: null, overContainer: true },
      },
    );

    assert.deepEqual(result.order[TODAY], ["A", "B", "C", "X"]);
  });

  it("keeps a single preview row while crossing several rows", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [
          { groupId: TODAY, overTaskId: "A" },
          { groupId: TODAY, overTaskId: "B" },
          { groupId: TODAY, overTaskId: "C" },
        ],
        drop: { groupId: TODAY, overTaskId: "B" },
      },
    );

    // The task leaves overdue exactly once; later hovers must not re-splice
    // it back to the top (that is what pinned every drop to first place).
    assert.deepEqual(result.previewOrder[TODAY], ["X", "A", "B", "C"]);
    assert.deepEqual(result.previewOrder[OVERDUE_GROUP_ID], []);
    assert.deepEqual(result.order[TODAY], ["A", "B", "X", "C"]);
  });

  it("persists the destination row's order index, not the preview slot", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        drop: { groupId: TODAY, overTaskId: "A" },
      },
    );

    // B's index, so the backend opens the gap at the second slot.
    assert.deepEqual(result.persisted, {
      fromDay: YESTERDAY,
      toDay: TODAY,
      toIndex: 1,
    });
  });
});

describe("reordering within a day", () => {
  it("moves the last task to second", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: tasksOnDay(TODAY, ["A", "B", "C"]) },
      { taskId: "C", hover: [], drop: { groupId: TODAY, overTaskId: "B" } },
    );

    assert.deepEqual(result.order[TODAY], ["A", "C", "B"]);
  });

  it("moves the first task to second", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: tasksOnDay(TODAY, ["A", "B", "C"]) },
      { taskId: "A", hover: [], drop: { groupId: TODAY, overTaskId: "B" } },
    );

    assert.deepEqual(result.order[TODAY], ["B", "A", "C"]);
  });

  it("moves the first task to last", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: tasksOnDay(TODAY, ["A", "B", "C"]) },
      { taskId: "A", hover: [], drop: { groupId: TODAY, overTaskId: "C" } },
    );

    assert.deepEqual(result.order[TODAY], ["B", "C", "A"]);
  });

  it("leaves the order alone when dropped back on its own slot", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: tasksOnDay(TODAY, ["A", "B", "C"]) },
      { taskId: "B", hover: [], drop: { groupId: TODAY, overTaskId: null } },
    );

    assert.deepEqual(result.order[TODAY], ["A", "B", "C"]);
    assert.equal(result.persisted.toIndex, 1);
  });

  it("moves to second when a completed task holds a lower order index", () => {
    // The original production bug: completed tasks sort last for display, so
    // the visible second row is not order index 1.
    const tasks: SimTask[] = [
      { _id: "done", taskDay: TODAY, taskDayOrderIndex: 0, dateCompleted: TODAY },
      { _id: "A", taskDay: TODAY, taskDayOrderIndex: 1 },
      { _id: "B", taskDay: TODAY, taskDayOrderIndex: 2 },
      { _id: "C", taskDay: TODAY, taskDayOrderIndex: 3 },
    ];

    const result = simulateDrag(
      { today: TODAY, tasks },
      { taskId: "C", hover: [], drop: { groupId: TODAY, overTaskId: "B" } },
    );

    assert.deepEqual(result.order[TODAY], ["A", "C", "B", "done"]);
  });
});

describe("applyHoverTransfer", () => {
  it("is a no-op once the task already sits in the target group", () => {
    const groups = [
      { id: OVERDUE_GROUP_ID, tasks: [] as SimTask[] },
      { id: TODAY, tasks: tasksOnDay(TODAY, ["X", "A", "B"]) },
    ];

    const next = applyHoverTransfer(groups, {
      draggedId: "X",
      toGroupId: TODAY,
      overTaskId: "B",
    });

    assert.equal(next, groups, "must return the same reference to bail out");
  });

  it("inserts below the hovered row when entering from underneath", () => {
    const groups = [
      { id: TODAY, tasks: tasksOnDay(TODAY, ["A", "B"]) },
      { id: "2026-09-20", tasks: tasksOnDay("2026-09-20", ["X"]) },
    ];

    const next = applyHoverTransfer(groups, {
      draggedId: "X",
      toGroupId: TODAY,
      overTaskId: "B",
      insertAfterOver: true,
    });

    assert.deepEqual(
      next.find((g) => g.id === TODAY)?.tasks.map((t) => t._id),
      ["A", "B", "X"],
    );
  });
});

describe("resolveTaskDropIndex", () => {
  it("reads the list including the dragged task for a same-day move", () => {
    const rows = tasksOnDay(TODAY, ["A", "B", "C"]);

    const result = resolveTaskDropIndex({
      draggedId: "A",
      fromGroupId: TODAY,
      toGroupId: TODAY,
      destRows: rows,
      overTaskId: "B",
    });

    // productivity-one: items[currentIndex] is the hovered row itself.
    assert.equal(result.toIndex, 1);
    assert.equal(result.currentIndex, 1);
  });

  it("reads the list excluding the dragged task for a cross-day move", () => {
    const rows = [
      { _id: "X", taskDayOrderIndex: 0 },
      ...tasksOnDay(TODAY, ["A", "B", "C"]),
    ];

    const result = resolveTaskDropIndex({
      draggedId: "X",
      fromGroupId: OVERDUE_GROUP_ID,
      toGroupId: TODAY,
      destRows: rows,
      overTaskId: "A",
    });

    // items = [A, B, C]; currentIndex 1 -> lands above B.
    assert.equal(result.toIndex, 1);
    assert.equal(result.insertAboveId, "B");
  });

  it("appends past the highest index when order indices are sparse", () => {
    const rows: SimTask[] = [
      { _id: "A", taskDay: TODAY, taskDayOrderIndex: 4 },
      { _id: "B", taskDay: TODAY, taskDayOrderIndex: 9 },
    ];

    const result = resolveTaskDropIndex({
      draggedId: "X",
      fromGroupId: OVERDUE_GROUP_ID,
      toGroupId: TODAY,
      destRows: rows,
      overTaskId: null,
      overContainer: true,
    });

    assert.equal(result.toIndex, 10);
    assert.equal(result.insertAboveId, null);
  });
});
