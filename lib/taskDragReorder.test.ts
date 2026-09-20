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

  it("persists the destination row it lands above, not the preview slot", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: overdueAndToday() },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        drop: { groupId: TODAY, overTaskId: "A" },
      },
    );

    // Lands above B, i.e. the second slot. `toIndex` is B's stored index,
    // sent only so a tab on the previous bundle still resolves the same way.
    assert.deepEqual(result.persisted, {
      fromDay: YESTERDAY,
      toDay: TODAY,
      insertAboveId: "B",
      toIndex: 1,
      isNoop: false,
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

/**
 * Production data does not hold the "dense unique 0..n-1 per day" invariant
 * the index math assumed. The Supabase migration wrote
 * `COALESCE(task_day_order_index, 0)`: of 195 migrated day buckets with more
 * than one task, 131 have a repeated index and 44 are entirely zeros. Every
 * drop then aimed at a slot several rows shared and landed on the first of
 * them, which is why "drop on the second row" put the task first in prod
 * while every test here passed on clean local data.
 */
describe("days whose stored order indices repeat", () => {
  /** A day reading [0, 0, 2], the shape the migration produced. */
  function duplicated(): SimTask[] {
    return [
      { _id: "A", taskDay: TODAY, taskDayOrderIndex: 0, _creationTime: 1 },
      { _id: "B", taskDay: TODAY, taskDayOrderIndex: 0, _creationTime: 2 },
      { _id: "C", taskDay: TODAY, taskDayOrderIndex: 2, _creationTime: 3 },
    ];
  }

  it("moves the last task to second instead of first", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: duplicated() },
      { taskId: "C", hover: [], drop: { groupId: TODAY, overTaskId: "B" } },
    );

    assert.deepEqual(result.order[TODAY], ["A", "C", "B"]);
  });

  it("drops an overdue task into the second slot", () => {
    const result = simulateDrag(
      {
        today: TODAY,
        tasks: [
          { _id: "X", taskDay: YESTERDAY, taskDayOrderIndex: 0 },
          ...duplicated(),
        ],
      },
      {
        taskId: "X",
        hover: [{ groupId: TODAY, overTaskId: "A" }],
        drop: { groupId: TODAY, overTaskId: "A" },
      },
    );

    assert.deepEqual(result.order[TODAY], ["A", "X", "B", "C"]);
  });

  it("drops into a day where every index is zero", () => {
    const allZero: SimTask[] = [
      { _id: "A", taskDay: TODAY, taskDayOrderIndex: 0, _creationTime: 1 },
      { _id: "B", taskDay: TODAY, taskDayOrderIndex: 0, _creationTime: 2 },
      { _id: "C", taskDay: TODAY, taskDayOrderIndex: 0, _creationTime: 3 },
    ];

    const result = simulateDrag(
      { today: TODAY, tasks: allZero },
      { taskId: "A", hover: [], drop: { groupId: TODAY, overTaskId: "C" } },
    );

    assert.deepEqual(result.order[TODAY], ["B", "C", "A"]);
  });

  it("leaves the day dense afterwards, so it only misbehaves once", () => {
    const tasks = duplicated();
    const first = simulateDrag(
      { today: TODAY, tasks },
      { taskId: "C", hover: [], drop: { groupId: TODAY, overTaskId: "B" } },
    );
    assert.deepEqual(first.order[TODAY], ["A", "C", "B"]);
    assert.deepEqual(first.repairedOrderIndices[TODAY], [0, 1, 2]);
  });

  /**
   * A real day, read off the deployment: five completed rows at 0-3 and 10,
   * then incomplete rows at 11, 12, 14, 15, 16, 18, 18, 18, 19, 20, 23.
   * Three tasks share index 18, which is the slot a drop could not address.
   */
  function realDay(): SimTask[] {
    const rows: Array<[string, number, boolean]> = [
      ["Amazon General", 0, true],
      ["TL Spot Pricing", 1, true],
      ["Nasip PCP", 2, true],
      ["General", 3, true],
      ["Planning", 10, true],
      ["Deploy to live", 11, false],
      ["List page", 12, false],
      ["DB bandwidth", 14, false],
      ["Upper body", 15, false],
      ["Lugia flag", 16, false],
      ["App Store", 18, false],
      ["Review my day", 18, false],
      ["Eggs", 18, false],
      ["Landing page", 19, false],
      ["Fix pipelines", 20, false],
      ["Andes BI", 23, false],
    ];
    return rows.map(([_id, taskDayOrderIndex, done], i) => ({
      _id,
      taskDay: TODAY,
      taskDayOrderIndex,
      _creationTime: i,
      ...(done ? { dateCompleted: TODAY } : {}),
    }));
  }

  it("drops onto the middle of a three-way tie, on real data", () => {
    const result = simulateDrag(
      { today: TODAY, tasks: realDay() },
      {
        taskId: "DB bandwidth",
        hover: [],
        drop: { groupId: TODAY, overTaskId: "Review my day" },
      },
    );

    assert.deepEqual(result.order[TODAY], [
      "Deploy to live",
      "List page",
      "Upper body",
      "Lugia flag",
      "App Store",
      "Review my day",
      "DB bandwidth",
      "Eggs",
      "Landing page",
      "Fix pipelines",
      "Andes BI",
      // Completed rows keep sorting last.
      "Amazon General",
      "TL Spot Pricing",
      "Nasip PCP",
      "General",
      "Planning",
    ]);
  });

  it("swaps two rows that share an index, which used to be a no-op", () => {
    // Same stored index on both sides meant `fromIndex === toIndex`, so the
    // mutation returned early and the row sprang back.
    const result = simulateDrag(
      { today: TODAY, tasks: realDay() },
      {
        taskId: "Eggs",
        hover: [],
        drop: { groupId: TODAY, overTaskId: "Review my day" },
      },
    );

    const incomplete = result.order[TODAY].slice(0, 5);
    assert.deepEqual(incomplete, [
      "Deploy to live",
      "List page",
      "DB bandwidth",
      "Upper body",
      "Lugia flag",
    ]);
    // Eggs moves up one slot, past Review my day only.
    assert.deepEqual(result.order[TODAY].slice(5, 8), [
      "App Store",
      "Eggs",
      "Review my day",
    ]);
  });

  it("still places a tab on the previous bundle, ambiguously", () => {
    // Documents the fallback rather than endorsing it: a legacy client can
    // only name the shared index, so it keeps landing first. A reload fixes
    // it, and the day is repaired by the first move from a current tab.
    const result = simulateDrag(
      { today: TODAY, tasks: duplicated() },
      {
        taskId: "C",
        hover: [],
        drop: { groupId: TODAY, overTaskId: "B" },
        legacyClient: true,
      },
    );

    assert.deepEqual(result.order[TODAY], ["C", "A", "B"]);
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
