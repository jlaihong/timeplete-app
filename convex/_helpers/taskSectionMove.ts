import { applyTillEndShift } from "./orderShift";

/** Minimum shape the section-move math needs. Keeps the plan unit-testable. */
export type SectionOrderedTask = {
  _id: string;
  sectionOrderIndex?: number;
  dateCompleted?: string;
  _creationTime?: number;
};

export type TaskSectionMovePlan = {
  /** New `sectionOrderIndex` for rows displaced by the move. */
  shifts: Array<{ _id: string; sectionOrderIndex: number }>;
  /** Final placement of the moved task; `null` when the move is a no-op. */
  moved: { _id: string; sectionId: string; sectionOrderIndex: number } | null;
};

export function isTaskCompletedForListView(t: {
  dateCompleted?: string;
}): boolean {
  const d = t.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

/**
 * List section order: incomplete first, then `sectionOrderIndex`.
 *
 * `sectionOrderIndex` is not unique per section. Tasks made by the agent
 * API, by a recurring rule, or by any caller that omits the index all land
 * on 0. Ties break on `_creationTime` so the query, the optimistic update
 * and the mutation agree on one order.
 */
export function compareTasksForListView<
  T extends {
    dateCompleted?: string;
    sectionOrderIndex?: number;
    _creationTime?: number;
  },
>(a: T, b: T): number {
  const aDone = isTaskCompletedForListView(a);
  const bDone = isTaskCompletedForListView(b);
  if (aDone !== bDone) return Number(aDone) - Number(bDone);
  const byOrder = (a.sectionOrderIndex ?? 0) - (b.sectionOrderIndex ?? 0);
  if (byOrder !== 0) return byOrder;
  return (a._creationTime ?? 0) - (b._creationTime ?? 0);
}

/**
 * Place the moved task directly above `insertAboveId` (or last when null)
 * and renumber its half of the destination section to a dense 0..n-1.
 *
 * Positional rather than arithmetic for the same reason as
 * `planTaskDayMove`: with repeated indices, "the drop target's stored
 * index" names a slot several rows share. Dragging between two rows with
 * the same index then read as fromIndex === toIndex and the row sprang
 * back.
 *
 * Only the rows with the moved task's completion state are renumbered. The
 * list shows incomplete rows above completed ones, so the two halves never
 * interleave and their indices may overlap. Renumbering both would rewrite
 * every completed row whenever the incomplete count changes, and a section
 * can hold thousands of those.
 *
 * The source section is left alone: a gap there is harmless once placement
 * is positional.
 */
function planPositionalSectionMove<T extends SectionOrderedTask>(args: {
  tasks: T[];
  moved: T;
  sectionOf: (task: T) => string;
  toSectionId: string;
  insertAboveId: string | null;
}): TaskSectionMovePlan {
  const taskId = args.moved._id;
  const movedDone = isTaskCompletedForListView(args.moved);
  const destRows = args.tasks.filter(
    (t) => t._id !== taskId && args.sectionOf(t) === args.toSectionId,
  );
  const rows = destRows
    .filter((t) => isTaskCompletedForListView(t) === movedDone)
    .sort(compareTasksForListView);

  let at = rows.length;
  if (args.insertAboveId) {
    const found = rows.findIndex((t) => t._id === args.insertAboveId);
    if (found >= 0) {
      at = found;
    } else if (
      movedDone &&
      destRows.some((t) => t._id === args.insertAboveId)
    ) {
      // Anchor is an incomplete row, which sits above every completed one.
      at = 0;
    }
  }

  const shifts: TaskSectionMovePlan["shifts"] = [];
  let order = 0;
  for (let i = 0; i < rows.length; i++) {
    if (i === at) order++;
    const row = rows[i];
    if (row.sectionOrderIndex !== order) {
      shifts.push({ _id: row._id, sectionOrderIndex: order });
    }
    order++;
  }

  const unchanged =
    shifts.length === 0 &&
    args.sectionOf(args.moved) === args.toSectionId &&
    args.moved.sectionOrderIndex === at;

  return {
    shifts,
    moved: unchanged
      ? null
      : { _id: taskId, sectionId: args.toSectionId, sectionOrderIndex: at },
  };
}

/**
 * Plan a move within or between list sections.
 *
 * `tasks` must hold every row of the source and destination sections, moved
 * row included. `sectionOf` returns the section a row is shown in, which is
 * not always its stored `sectionId` (orphans fall into the default section).
 *
 * `toIndex` is the gap shift on the drop target's persisted index. Only
 * reached for a client that predates `insertAboveId` (an installed phone
 * build or a tab on the previous bundle), and it keeps the duplicate-index
 * ambiguity described above.
 */
export function planTaskSectionMove<T extends SectionOrderedTask>(args: {
  tasks: T[];
  taskId: string;
  sectionOf: (task: T) => string;
  toSectionId: string;
  /** Row the moved task lands above; `null` appends it. Preferred. */
  insertAboveId?: string | null;
  toIndex?: number;
}): TaskSectionMovePlan {
  const moved = args.tasks.find((t) => t._id === args.taskId);
  if (!moved) throw new Error("Task not found");

  if (args.insertAboveId !== undefined) {
    return planPositionalSectionMove({
      tasks: args.tasks,
      moved,
      sectionOf: args.sectionOf,
      toSectionId: args.toSectionId,
      insertAboveId: args.insertAboveId,
    });
  }
  if (args.toIndex === undefined) {
    throw new Error("planTaskSectionMove needs insertAboveId or toIndex");
  }
  const toIndex = args.toIndex;

  const fromSectionId = args.sectionOf(moved);
  const fromIndex = moved.sectionOrderIndex ?? 0;
  if (fromSectionId === args.toSectionId && fromIndex === toIndex) {
    return { shifts: [], moved: null };
  }

  const shifted = applyTillEndShift(
    args.tasks.map((t) => ({
      _id: t._id,
      order: t.sectionOrderIndex ?? 0,
      section: args.sectionOf(t),
    })),
    (t) => t.order,
    (t, order) => ({ ...t, order }),
    fromIndex,
    toIndex,
    (t) => t._id === args.taskId,
    (t) => t.section === fromSectionId,
    (t) => t.section === args.toSectionId,
  );

  const before = new Map(args.tasks.map((t) => [t._id, t.sectionOrderIndex]));
  const shifts: TaskSectionMovePlan["shifts"] = [];
  for (const next of shifted) {
    if (next._id === args.taskId) continue;
    if (next.order !== before.get(next._id)) {
      shifts.push({ _id: next._id, sectionOrderIndex: next.order });
    }
  }

  return {
    shifts,
    moved: {
      _id: args.taskId,
      sectionId: args.toSectionId,
      sectionOrderIndex: toIndex,
    },
  };
}
