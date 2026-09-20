import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import {
  useDndMonitor,
  useDroppable,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDate,
  getDaysInRange,
  isToday,
} from "../../lib/dates";
import { useTimer } from "../../hooks/useTimer";
import { useAuth } from "../../hooks/useAuth";
import { useTaskUpsertMutation } from "../../hooks/useTaskUpsertMutation";
import { useTaskMoveMutations } from "../../hooks/useTaskMoveMutations";
import { moveOverdueTaskToTodayOnTimerStart } from "../../lib/moveOverdueTaskToTodayOnTimerStart";
import { compareTasksForDay } from "../../convex/_helpers/compareTasksForDay";
import { resolveDragDropTargetId } from "../../lib/resolveDragDropTarget";
import {
  applyHoverTransfer,
  resolveTaskDropIndex,
} from "../../lib/taskDragReorder";
import { EmptyState } from "../ui/EmptyState";
import { SectionHeadingAddButton } from "../ui/SectionHeadingAddButton";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
  TaskDragPlaceholder,
} from "./TaskRowDesktop";
import { TaskFilterModal } from "./TaskFilterModal";
import { useTaskFilters } from "../../hooks/useTaskFilters";
import { useHomeAssignableMembers } from "../../hooks/useHomeAssignableMembers";
import {
  taskCompletedForFilters,
  taskMatchesUserFilter,
} from "../../lib/taskFilters";
import { useTaskTimeSpentEditor } from "./useTaskTimeSpentEditor";
import { useTaskDeleteMutation } from "../../hooks/useTaskDeleteMutation";

const isWeb = Platform.OS === "web";
const LOAD_MORE_DAYS = 7;
const OVERDUE_GROUP_ID = "overdue";
const UNSCHEDULED_GROUP_ID = "unscheduled";

interface DesktopTaskListProps {
  title?: string;
  onAddTask?: (day?: string) => void;
  onSelectTask?: (taskId: Id<"tasks">) => void;
  /**
   * Calendar header day on home (`CalendarView` selection).
   * Convex stays subscribed at clock-today (`getHomeTasks`); stepping backward
   * merges `searchWithCriteria` without shifting that anchor (productivity-one window retention).
   */
  rangeStartYYYYMMDD?: string;
}

/* ─────────────────────  Lifted-DndContext monitor  ──────────────────────
 * `useDndMonitor` must be invoked from a descendant of the relevant
 * DndContext. The DesktopTaskList is rendered inside `HomeDndProvider`
 * (DesktopHome → HomeDndProvider → … → DesktopTaskList), so this tiny
 * wrapper qualifies. It registers the list's reorder handlers and
 * renders nothing.
 */
interface TaskListDndMonitorProps {
  onDragStart: (event: DragStartEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void | Promise<void>;
  onDragCancel: () => void;
}

function TaskListDndMonitor({
  onDragStart,
  onDragOver,
  onDragEnd,
  onDragCancel,
}: TaskListDndMonitorProps) {
  useDndMonitor({
    onDragStart,
    onDragOver,
    onDragEnd,
    onDragCancel,
  });
  return null;
}

/* ─────────────────────────────  Sortable Row  ───────────────────────────── */

interface SortableRowProps {
  task: TaskRowTask;
  meta: TaskRowMeta;
  groupId: string;
  isTicking: boolean;
  timerStartTime: number | null;
  canDrag: boolean;
  /** Resolved display colour (trackable → list → default grey). */
  displayColor: string;
  /** Default duration in seconds for calendar drop (P1: timeEstimated || 30 min). */
  durationSec: number;
  onSelect?: (id: Id<"tasks">) => void;
  onToggleComplete?: (id: Id<"tasks">) => void;
  onToggleTimer?: (id: Id<"tasks">) => void;
  onSetTimeSpent?: (id: Id<"tasks">, newSeconds: number) => void;
  onRequestContextMenu?: (id: Id<"tasks">, x: number, y: number) => void;
}

function SortableRow({
  task,
  meta,
  groupId,
  isTicking,
  timerStartTime,
  canDrag,
  displayColor,
  durationSec,
  onSelect,
  onToggleComplete,
  onToggleTimer,
  onSetTimeSpent,
  onRequestContextMenu,
}: SortableRowProps) {
  // Whole-card drag: dnd-kit's listeners are spread onto TaskRowDesktop's
  // outer `<View>` via `dragHandleProps`. There is no separate grip and
  // no HTML5 native drag — see comment in TaskRowDesktop for the history.
  //
  // The `data` payload carries everything the calendar's drop preview
  // needs (color, duration, full task) without any extra plumbing.
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task._id,
    data: { type: "task", groupId, task, meta, displayColor, durationSec },
    disabled: !canDrag,
  });

  const style: any = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: "100%",
  };

  const dragHandleProps = canDrag
    ? ({ ...attributes, ...listeners } as Record<string, unknown>)
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      {isDragging ? (
        // Placeholder reserves the row's slot in the list while the real
        // card is rendered in the DragOverlay (see HomeDndProvider).
        <TaskDragPlaceholder />
      ) : (
        <TaskRowDesktop
          task={task}
          meta={meta}
          isTicking={isTicking}
          timerStartTime={timerStartTime}
          onSelect={onSelect}
          onToggleComplete={onToggleComplete}
          onToggleTimer={onToggleTimer}
          onSetTimeSpent={onSetTimeSpent}
          onRequestContextMenu={onRequestContextMenu}
          dragHandleProps={dragHandleProps}
        />
      )}
    </div>
  );
}

/* ───────────────────────────  Droppable Group  ──────────────────────────── */

interface DroppableGroupBodyProps {
  groupId: string;
  disabled: boolean;
  children: React.ReactNode;
  isEmpty: boolean;
}

function DroppableGroupBody({
  groupId,
  disabled,
  children,
  isEmpty,
}: DroppableGroupBodyProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `group:${groupId}`,
    data: { type: "group", groupId },
    // Same as list detail: a non-empty group rect contains every task, so
    // pointerWithin would pick `group:*` and treat the drop as "move to end".
    disabled: disabled || !isEmpty,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        width: "100%",
        ...(isEmpty
          ? {
              minHeight: 60,
              padding: 4,
              borderRadius: 8,
              transition: "background-color 120ms ease",
              backgroundColor: isOver
                ? "rgba(0, 218, 245, 0.08)"
                : "transparent",
            }
          : null),
      }}
    >
      {isEmpty && !disabled ? (
        <View style={styles.emptyDropZone}>
          <Text style={styles.emptyDropZoneText}>Drag & drop tasks here</Text>
        </View>
      ) : null}
      {children}
    </div>
  );
}

/* ─────────────────────────────  Main List  ──────────────────────────────── */

export function DesktopTaskList({
  title,
  onAddTask,
  onSelectTask,
  rangeStartYYYYMMDD,
}: DesktopTaskListProps) {
  const { profileReady } = useAuth();
  const clockToday = todayYYYYMMDD();
  const calendarDay = rangeStartYYYYMMDD ?? clockToday;
  /**
   * Visible day-column anchor / UI overdue cutoff (not the Convex `today`
   * argument — that stays `clockToday`).
   */
  const visibleStartDay =
    calendarDay < clockToday ? calendarDay : clockToday;
  const windowEndBase =
    calendarDay > clockToday ? calendarDay : clockToday;

  const [rangeEndDays, setRangeEndDays] = useState(0);
  const visibleEndDay = addDays(windowEndBase, rangeEndDays);

  /**
   * Monotonic retention (productivity-one): never drop columns/range once loaded.
   * — Earliest day shrinks when the calendar moves back; never grows back when it moves forward.
   * — Latest range-end grows with calendar/load-more; never shrinks when the calendar moves back.
   */
  const [loadedEarliestDay, setLoadedEarliestDay] = useState<string | null>(
    null,
  );
  const [maxRangeEndDay, setMaxRangeEndDay] = useState<string | null>(null);

  useLayoutEffect(() => {
    setLoadedEarliestDay((prev) => {
      if (prev === null) return visibleStartDay;
      return visibleStartDay.localeCompare(prev) < 0 ? visibleStartDay : prev;
    });
  }, [visibleStartDay]);

  useLayoutEffect(() => {
    setMaxRangeEndDay((prev) => {
      if (prev === null) return visibleEndDay;
      return visibleEndDay.localeCompare(prev) > 0 ? visibleEndDay : prev;
    });
  }, [visibleEndDay]);

  const retainedEarliestDay = loadedEarliestDay ?? visibleStartDay;
  const retainedRangeEndDay = maxRangeEndDay ?? visibleEndDay;

  /**
   * Primary home subscription — productivity-one keeps `today` pinned to the
   * real calendar day so stepping the date navigator does not invalidate this.
   */
  const primaryTasksQuery = useQuery(
    api.tasks.getHomeTasks,
    profileReady
      ? {
          todayYYYYMMDD: clockToday,
          rangeEndYYYYMMDD: retainedRangeEndDay,
        }
      : "skip",
  );

  const backwardGapEnd = addDays(clockToday, -1);
  const backwardGapActive =
    profileReady &&
    retainedEarliestDay < clockToday &&
    retainedEarliestDay <= backwardGapEnd;

  /** Uses long-deployed `searchWithCriteria` — avoids requiring a new Convex function on shared backends. */
  const backwardGapTasksQuery = useQuery(
    api.tasks.searchWithCriteria,
    backwardGapActive
      ? {
          dayRanges: [{ startDay: retainedEarliestDay, endDay: backwardGapEnd }],
          includeCompleted: true,
          completedStartDay: retainedEarliestDay,
          completedEndDay: backwardGapEnd,
        }
      : "skip",
  );

  const mergedFromQueries = useMemo((): TaskRowTask[] | undefined => {
    if (primaryTasksQuery === undefined) return undefined;
    const merged = new Map<string, TaskRowTask>();
    for (const t of primaryTasksQuery as TaskRowTask[]) {
      merged.set(t._id, t);
    }
    if (backwardGapTasksQuery !== undefined) {
      for (const t of backwardGapTasksQuery as TaskRowTask[]) {
        if (!merged.has(t._id)) {
          merged.set(t._id, {
            ...t,
            tagIds: t.tagIds ?? [],
          });
        }
      }
    }
    return [...merged.values()].sort(
      (a, b) => (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0),
    );
  }, [primaryTasksQuery, backwardGapTasksQuery]);

  /**
   * Load-more refetch: keep merged rows visible until the wider primary payload arrives.
   */
  const lastMergedStableRef = useRef<{
    clockToday: string;
    retainedRangeEndDay: string;
    tasks: TaskRowTask[];
  } | null>(null);

  const tasks = useMemo((): TaskRowTask[] | undefined => {
    if (mergedFromQueries !== undefined) return mergedFromQueries;
    const prev = lastMergedStableRef.current;
    if (
      prev &&
      prev.clockToday === clockToday &&
      retainedRangeEndDay.localeCompare(prev.retainedRangeEndDay) > 0
    ) {
      return prev.tasks;
    }
    return undefined;
  }, [mergedFromQueries, clockToday, retainedRangeEndDay]);

  useEffect(() => {
    if (mergedFromQueries !== undefined) {
      lastMergedStableRef.current = {
        clockToday,
        retainedRangeEndDay,
        tasks: mergedFromQueries,
      };
    }
  }, [mergedFromQueries, clockToday, retainedRangeEndDay]);
  const tags = useQuery(api.tags.search, profileReady ? {} : "skip");
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const sharedWithMeAccepted = useQuery(
    api.sharing.getSharedWithMe,
    profileReady ? { status: "ACCEPTED" } : "skip",
  );
  const trackables = useQuery(api.trackables.search, profileReady ? {} : "skip");
  const recurringRules = useQuery(
    api.recurringTasks.list,
    profileReady ? {} : "skip",
  );

  /* ──────────────────  Recurring instance materialization  ──────────────────
   * Recurring tasks live as a single `recurringTasks` rule plus zero-to-many
   * materialized `tasks` rows (one per occurrence). Materialization is lazy:
   * the home page calls `generateInstances(retainedEarliestDay, retainedRangeEndDay)` whenever
   * its window changes, and the mutation idempotently fills any missing
   * `(ruleId, taskDay)` rows. Once the rows exist, the reactive queries pull
   * them in like any other task — no synthetic-id branches downstream.
   *
   * Idempotency note: `generateInstances` de-dupes against existing
   * `(recurringTaskId, taskDay)` so calling it on every range change (or
   * after a rule edit) cannot create duplicates. The `recurringRules`
   * subscription is included in the effect deps so creating/editing a
   * rule triggers a regeneration immediately, before the user has to
   * scroll or change the window.
   */
  const generateInstances = useMutation(
    api.recurringTasks.generateInstances
  );
  useEffect(() => {
    // Only fire after the rules subscription has loaded — otherwise we
    // generate an empty result (harmless) and then re-fire once the
    // subscription resolves, doubling RTTs on first paint.
    if (recurringRules === undefined) return;
    void generateInstances({
      rangeStartYYYYMMDD: retainedEarliestDay,
      rangeEndYYYYMMDD: retainedRangeEndDay,
    });
    // We intentionally key on the *content* of the rules array, not the
    // identity, so a rule mutation immediately re-materializes — but a
    // re-render with no rule change is a no-op.
  }, [
    retainedEarliestDay,
    retainedRangeEndDay,
    recurringRules?.length,
    recurringRules?.map((r) => r._id).join(","),
    generateInstances,
  ]);
  const upsertTask = useTaskUpsertMutation();
  // Recurring-instance vs normal-task delete routing lives in the shared
  // hook (`useTaskDeleteMutation`) so desktop / mobile / detail-sheet all
  // apply the same skip-set-aware `deleteInstance` for recurring rows.
  const deleteTaskMutation = useTaskDeleteMutation();
  const { moveOnDay, moveBetweenDays } = useTaskMoveMutations();
  const timer = useTimer();
  // Tap-to-edit time spent — ALL task surfaces share this hook so the
  // mutation, optimistic update, and dialog behave identically.
  const { saveTimeSpent } = useTaskTimeSpentEditor();
  const homeFilterScope = useMemo(() => ({ kind: "home" as const }), []);
  const {
    showCompleted,
    filterUserIds,
    persistShowCompleted,
    toggleUserFilter,
    isFilterActive,
  } = useTaskFilters(homeFilterScope);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  const homeAssignableMembers = useHomeAssignableMembers(
    lists ?? undefined,
    sharedWithMeAccepted,
  );

  const showCollaboratorFilter = homeAssignableMembers.length > 1;

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [contextMenu, setContextMenu] = useState<{
    taskId: Id<"tasks">;
    x: number;
    y: number;
  } | null>(null);

  // Dismiss context menu on outside click / scroll / escape (web only).
  useEffect(() => {
    if (!isWeb || !contextMenu) return;
    const dismiss = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    window.addEventListener("click", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  const openContextMenu = useCallback(
    (taskId: Id<"tasks">, x: number, y: number) => {
      setContextMenu({ taskId, x, y });
    },
    []
  );

  /* Maps for tag/list/trackable lookup */
  const tagMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    tags?.forEach((t: any) =>
      m.set(t._id, { name: t.name, colour: t.colour })
    );
    return m;
  }, [tags]);

  const listMap = useMemo(() => {
    const m = new Map<
      string,
      { name: string; colour: string; isGoalList?: boolean; isInbox?: boolean }
    >();
    lists?.forEach((l: any) =>
      m.set(l._id, {
        name: l.name,
        colour: l.colour,
        isGoalList: l.isGoalList,
        isInbox: l.isInbox,
      })
    );
    return m;
  }, [lists]);

  const trackableMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    trackables?.forEach((t: any) =>
      m.set(t._id, { name: t.name, colour: t.colour })
    );
    return m;
  }, [trackables]);

  /* Group tasks — merged Convex payloads (`getHomeTasks` clock anchor +
   * optional backward gap). Day buckets span retained `[retainedEarliestDay, retainedRangeEndDay]`;
   * OVERDUE = incomplete tasks scheduled **before** `retainedEarliestDay`.
   */
  const serverGroups = useMemo(() => {
    if (!tasks) return [] as { id: string; tasks: TaskRowTask[] }[];
    const groups = new Map<string, TaskRowTask[]>();

    for (const task of tasks as any as TaskRowTask[]) {
      // Completed tasks group by completion date; incomplete by schedule day.
      if (task.dateCompleted) {
        const d = task.dateCompleted;
        if (!groups.has(d)) groups.set(d, []);
        groups.get(d)!.push(task);
        continue;
      }

      const scheduleDay = task.taskDay;
      if (!scheduleDay) {
        if (!groups.has(UNSCHEDULED_GROUP_ID))
          groups.set(UNSCHEDULED_GROUP_ID, []);
        groups.get(UNSCHEDULED_GROUP_ID)!.push(task);
        continue;
      }

      if (scheduleDay < retainedEarliestDay) {
        if (!groups.has(OVERDUE_GROUP_ID))
          groups.set(OVERDUE_GROUP_ID, []);
        groups.get(OVERDUE_GROUP_ID)!.push(task);
      } else {
        if (!groups.has(scheduleDay)) groups.set(scheduleDay, []);
        groups.get(scheduleDay)!.push(task);
      }
    }

    // Always show every day in the visible window, even if empty,
    // so users have an obvious target for adding/scheduling tasks.
    for (const d of getDaysInRange(retainedEarliestDay, retainedRangeEndDay)) {
      if (!groups.has(d)) groups.set(d, []);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === OVERDUE_GROUP_ID) return -1;
      if (b === OVERDUE_GROUP_ID) return 1;
      if (a === UNSCHEDULED_GROUP_ID) return 1;
      if (b === UNSCHEDULED_GROUP_ID) return -1;
      return a.localeCompare(b);
    });

    /**
     * Match productivity-one's `compareTasksForDay` (shared helper):
     * incomplete first, then `taskDayOrderIndex`. Persistence uses the
     * drop target's backend index, not this visual slot.
     */
    return sortedKeys.map((id) => ({
      id,
      tasks: (groups.get(id) ?? []).sort(compareTasksForDay),
    }));
  }, [tasks, retainedEarliestDay, retainedRangeEndDay]);

  /* Local optimistic state — mirrors serverGroups but is mutated during drag. */
  const [localGroups, setLocalGroups] = useState<
    { id: string; tasks: TaskRowTask[] }[]
  >([]);

  // Sync from server when query updates AND we are not mid-drag.
  const isDraggingRef = useRef(false);
  useEffect(() => {
    if (!isDraggingRef.current) {
      setLocalGroups(serverGroups);
    }
  }, [serverGroups]);

  /* Build display groups (parity with Lists: assignee filter → header counts; then completed) */
  const displayGroups = useMemo(() => {
    const hasUser = filterUserIds.length > 0;
    return localGroups.map((g) => {
      const allTasks = g.tasks;
      let forUserFilter = allTasks;
      if (hasUser) {
        forUserFilter = forUserFilter.filter((task) =>
          taskMatchesUserFilter(
            task as TaskRowTask & {
              createdBy: string;
              assignedToUserId?: string;
            },
            filterUserIds,
          ),
        );
      }
      const completedCount = forUserFilter.filter((t) =>
        taskCompletedForFilters(t),
      ).length;
      const totalCount = forUserFilter.length;
      const visibleTasks = showCompleted
        ? forUserFilter
        : forUserFilter.filter((t) => !t.dateCompleted);

      const dndUnlocked = !hasUser;

      return {
        id: g.id,
        label:
          g.id === OVERDUE_GROUP_ID
            ? "Overdue"
            : g.id === UNSCHEDULED_GROUP_ID
              ? "Unscheduled"
              : isToday(g.id)
                ? "Today"
                : formatDisplayDate(g.id),
        tasks: visibleTasks,
        completedCount,
        totalCount,
        canDrag: dndUnlocked && g.id !== UNSCHEDULED_GROUP_ID,
        canDropInto:
          dndUnlocked &&
          g.id !== OVERDUE_GROUP_ID &&
          g.id !== UNSCHEDULED_GROUP_ID,
      };
    });
  }, [localGroups, showCompleted, filterUserIds]);

  /* ───── Mutations ───── */
  const toggleComplete = useCallback(
    (taskId: Id<"tasks">) => {
      const task = (tasks as any as TaskRowTask[] | undefined)?.find(
        (t) => t._id === taskId
      );
      if (!task) return;

      const wasCompleted = !!task.dateCompleted;

      // Diagnostic timing – remove or guard with a flag once verified.
      // Logs the wall-clock time from click → optimistic patch returning
      // synchronously vs the server-ack arriving later.
      const t0 =
        typeof performance !== "undefined" ? performance.now() : Date.now();

      // Fire-and-forget. The optimistic update on `upsertTask` patches the
      // local `getHomeTasks` cache synchronously, so React re-renders with
      // the new state on the next frame – well before the server ack returns.
      // We only `await` for error handling / logging, not to gate the UI.
      void (async () => {
        if (!wasCompleted && timer.isRunning && timer.taskId === taskId) {
          await timer.stop();
        }
        await upsertTask({
          id: taskId,
          name: task.name,
          // `null` clears the field server-side; a string sets it to today.
          dateCompleted: wasCompleted ? null : todayYYYYMMDD(),
        });
        if (typeof __DEV__ !== "undefined" && __DEV__) {
          const t1 =
            typeof performance !== "undefined"
              ? performance.now()
              : Date.now();
          // eslint-disable-next-line no-console
          console.debug(
            `[toggleComplete] server ack: ${(t1 - t0).toFixed(1)}ms ` +
              `(UI updated optimistically at ~0ms)`
          );
        }
      })();
    },
    [tasks, timer, upsertTask]
  );

  const handleToggleTimer = useCallback(
    (taskId: Id<"tasks">) => {
      if (timer.isRunning && timer.taskId === taskId) {
        timer.stop();
      } else {
        const task = tasks?.find((t) => t._id === taskId);
        moveOverdueTaskToTodayOnTimerStart(
          moveBetweenDays,
          task,
          tasks ?? [],
          clockToday,
        );
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timer.startForTask(taskId, tz);
      }
    },
    [timer, tasks, moveBetweenDays, clockToday]
  );

  const handleDelete = useCallback(
    (taskId: Id<"tasks">) => {
      const task = tasks?.find((t) => t._id === taskId);
      deleteTaskMutation({
        taskId,
        taskName: task?.name,
        isRecurringInstance: task?.isRecurringInstance,
        recurringTaskId: task?.recurringTaskId,
      });
    },
    [deleteTaskMutation, tasks]
  );

  const handleSetTimeSpent = saveTimeSpent;

  /* ───── DnD ─────
   * Sensors, the DndContext, the DragOverlay, and the custom collision
   * detection live in `HomeDndProvider` so the calendar (a sibling) can
   * register hour cells as `useDroppable` siblings of these task rows.
   * Reorder logic stays here; we hook into the lifted DndContext via
   * `useDndMonitor` (see `<TaskListDndMonitor>` below).
   */
  const [activeDrag, setActiveDrag] = useState<{
    task: TaskRowTask;
    fromGroupId: string;
    fromIndex: number;
  } | null>(null);

  // Reverse lookup: taskId -> groupId in local state.
  const findTaskLocation = useCallback(
    (taskId: string): { groupId: string; index: number } | null => {
      for (const g of localGroups) {
        const idx = g.tasks.findIndex((t) => t._id === taskId);
        if (idx !== -1) return { groupId: g.id, index: idx };
      }
      return null;
    },
    [localGroups]
  );

  /** Drops with this prefix are owned by the calendar; the task list
   *  bows out (reverts any optimistic group moves and skips reorder). */
  const isCalendarDrop = (overId: string | undefined) =>
    !!overId && overId.startsWith("cal-hour-");

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = String(event.active.id);
      const loc = findTaskLocation(taskId);
      if (!loc) return;
      const task = localGroups[
        localGroups.findIndex((g) => g.id === loc.groupId)
      ].tasks[loc.index];
      isDraggingRef.current = true;
      setActiveDrag({
        task,
        fromGroupId: loc.groupId,
        fromIndex: loc.index,
      });
    },
    [findTaskLocation, localGroups]
  );

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;
      if (isCalendarDrop(overId)) return;

      const activeLoc = findTaskLocation(activeId);
      if (!activeLoc) return;

      const overTaskId = resolveDragDropTargetId(event, activeId, (id) =>
        findTaskLocation(id) != null,
      );
      const overData = over.data.current as
        | { type?: string; groupId?: string }
        | undefined;

      let targetGroupId: string;
      if (overTaskId) {
        const overLoc = findTaskLocation(overTaskId);
        if (!overLoc) return;
        targetGroupId = overLoc.groupId;
      } else if (overData?.type === "group" && overData.groupId) {
        targetGroupId = overData.groupId;
      } else {
        const overLoc = findTaskLocation(overId);
        if (!overLoc) return;
        targetGroupId = overLoc.groupId;
      }

      if (
        targetGroupId === OVERDUE_GROUP_ID ||
        targetGroupId === UNSCHEDULED_GROUP_ID
      ) {
        return;
      }

      if (activeLoc.groupId === targetGroupId) return;

      const draggedTop = active.rect.current.translated?.top;
      const insertAfterOver =
        overTaskId != null &&
        draggedTop != null &&
        draggedTop > over.rect.top + over.rect.height / 2;

      setLocalGroups((prev) =>
        applyHoverTransfer(prev, {
          draggedId: activeId,
          toGroupId: targetGroupId,
          overTaskId,
          insertAfterOver,
        }),
      );
    },
    [findTaskLocation]
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const startInfo = activeDrag;
      setActiveDrag(null);
      if (!startInfo) {
        isDraggingRef.current = false;
        return;
      }

      try {
        const { active, over } = event;
        const overId = over ? String(over.id) : undefined;

        // Calendar owns this drop. The CalendarView has already (or is about
        // to) call `timeWindows.upsert` from its own useDndMonitor handler.
        // Revert any optimistic cross-group moves we made during onDragOver
        // by re-syncing from the server.
        if (isCalendarDrop(overId)) {
          setLocalGroups(serverGroups);
          return;
        }

        const taskId = String(active.id) as Id<"tasks">;

        // Find where the task currently lives in optimistic state (cross-group
        // moves were already applied during onDragOver).
        const currentLoc = findTaskLocation(taskId);
        if (!currentLoc) return;

        const overTaskId = resolveDragDropTargetId(event, taskId, (id) =>
          findTaskLocation(id) != null,
        );
        const overData = over?.data.current as
          | { type?: string; groupId?: string }
          | undefined;
        const overContainerGroupId =
          !overTaskId && overData?.type === "group"
            ? overData.groupId
            : undefined;

        let toDay = currentLoc.groupId;
        let overLocalIndex: number | null = null;
        if (overTaskId) {
          const overLoc = findTaskLocation(overTaskId);
          if (overLoc) {
            toDay = overLoc.groupId;
            overLocalIndex = overLoc.index;
          }
        } else if (overContainerGroupId) {
          toDay = overContainerGroupId;
        }

        if (
          toDay === OVERDUE_GROUP_ID ||
          toDay === UNSCHEDULED_GROUP_ID
        ) {
          setLocalGroups(serverGroups);
          return;
        }

        const { toIndex, insertAboveId, isNoop } = resolveTaskDropIndex({
          draggedId: taskId,
          fromGroupId: startInfo.fromGroupId,
          toGroupId: toDay,
          destRows: displayGroups.find((g) => g.id === toDay)?.tasks ?? [],
          overTaskId,
          overContainer: overContainerGroupId != null,
        });

        if (startInfo.fromGroupId === toDay) {
          // Same day: commit the order the sortable transforms were showing.
          const destLength =
            localGroups.find((g) => g.id === toDay)?.tasks.length ?? 0;
          const target =
            overLocalIndex ??
            (overContainerGroupId != null
              ? Math.max(0, destLength - 1)
              : currentLoc.index);
          if (target !== currentLoc.index) {
            setLocalGroups((prev) =>
              prev.map((g) =>
                g.id !== toDay
                  ? g
                  : { ...g, tasks: arrayMove(g.tasks, currentLoc.index, target) },
              ),
            );
          }
        } else {
          setLocalGroups((prev) => {
            const next = prev.map((g) => ({
              ...g,
              tasks: g.tasks.filter((t) => t._id !== taskId),
            }));
            const dest = next.find((g) => g.id === toDay);
            if (!dest) return prev;
            const at = insertAboveId
              ? dest.tasks.findIndex((t) => t._id === insertAboveId)
              : -1;
            dest.tasks.splice(at >= 0 ? at : dest.tasks.length, 0, {
              ...startInfo.task,
              taskDay: toDay,
              taskDayOrderIndex: toIndex,
            });
            return next;
          });
        }

        const draggedTask = startInfo.task;
        const persistenceFromDay =
          startInfo.fromGroupId === OVERDUE_GROUP_ID
            ? draggedTask.taskDay!
            : draggedTask.dateCompleted && draggedTask.taskDay
              ? draggedTask.taskDay
              : startInfo.fromGroupId;

        const persistenceToDay =
          draggedTask.dateCompleted &&
          toDay === draggedTask.dateCompleted
            ? (draggedTask.taskDay ?? toDay)
            : toDay;

        // No-op
        if (persistenceFromDay === persistenceToDay && isNoop) {
          return;
        }
        // Disallow drop targets
        if (
          persistenceToDay === OVERDUE_GROUP_ID ||
          persistenceToDay === UNSCHEDULED_GROUP_ID
        ) {
          // Revert local state by re-syncing on next query update.
          setLocalGroups(serverGroups);
          return;
        }

        try {
          const insertAboveTaskId = (insertAboveId ??
            null) as Id<"tasks"> | null;
          if (persistenceFromDay === persistenceToDay) {
            await moveOnDay({
              taskId,
              day: persistenceFromDay,
              insertAboveTaskId,
              toIndex,
            });
          } else {
            await moveBetweenDays({
              taskId,
              fromDay: persistenceFromDay,
              toDay: persistenceToDay,
              insertAboveTaskId,
              toIndex,
            });
          }
        } catch (err) {
          // Revert by resyncing
          setLocalGroups(serverGroups);
          // eslint-disable-next-line no-console
          console.error("Task move failed", err);
        }
      } finally {
        isDraggingRef.current = false;
      }
    },
    [
      activeDrag,
      displayGroups,
      findTaskLocation,
      localGroups,
      moveBetweenDays,
      moveOnDay,
      serverGroups,
    ]
  );

  const onDragCancel = useCallback(() => {
    setActiveDrag(null);
    isDraggingRef.current = false;
    setLocalGroups(serverGroups);
  }, [serverGroups]);

  const buildMeta = useCallback(
    (task: TaskRowTask): TaskRowMeta => {
      const trackable = task.trackableId
        ? trackableMap.get(task.trackableId) ?? null
        : null;
      const list = task.listId ? listMap.get(task.listId) ?? null : null;
      const tagsForTask = (task.tagIds ?? [])
        .map((id) => tagMap.get(id))
        .filter(
          (t): t is { name: string; colour: string } => t != null
        );
      return { trackable, list, tags: tagsForTask };
    },
    [trackableMap, listMap, tagMap]
  );

  /**
   * Display colour precedence — matches productivity-one's
   * `interactive-calendar-event-factory.service.ts` (lines 73-106) and
   * `interactive-calendar-drag-preview.service.ts` (lines 22-83):
   *   1. trackable.colour  (task.trackableId → trackable)
   *   2. list.colour       (task.listId → list)
   *   3. P1 default grey   ('#6b7280' from interactive-calendar.ts:106)
   *
   * Used both as the dnd-kit drag-data `displayColor` for the calendar
   * preview and (future) for the rendered event card after drop.
   */
  const deriveDisplayColor = useCallback(
    (task: TaskRowTask): string => {
      if (task.trackableId) {
        const tr = trackableMap.get(task.trackableId);
        if (tr?.colour) return tr.colour;
      }
      if (task.listId) {
        const ls = listMap.get(task.listId);
        if (ls?.colour) return ls.colour;
      }
      return "#6b7280";
    },
    [trackableMap, listMap]
  );

  /** Default-window duration for a task drop (P1 fallback chain). */
  const DEFAULT_DURATION_SEC = 1800;
  const deriveDurationSec = useCallback((task: TaskRowTask): number => {
    const est = (task as unknown as { timeEstimatedInSecondsUnallocated?: number })
      .timeEstimatedInSecondsUnallocated;
    if (typeof est === "number" && est > 60) return est;
    return DEFAULT_DURATION_SEC;
  }, []);

  const toggleGroupExpansion = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  // "Load More" is server-driven: bumping `rangeEndDays` changes the args
  // passed to `api.tasks.getHomeTasks`, which triggers a fresh server fetch.
  // The client never holds days that haven't been requested.
  const handleLoadMore = useCallback(() => {
    setRangeEndDays((d) => d + LOAD_MORE_DAYS);
  }, []);

  if (!tasks) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  const Wrapper: any = isWeb ? "div" : View;
  const wrapperProps = isWeb
    ? { style: { display: "flex", flexDirection: "column", flex: 1 } as any }
    : { style: { flex: 1 } };

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          <Pressable
            onPress={() => setFilterMenuOpen(true)}
            style={styles.filterIconBtn}
            accessibilityRole="button"
            accessibilityLabel="Filters"
            hitSlop={10}
          >
            <MaterialIcons
              name="filter-list"
              size={26}
              color={
                isFilterActive ? Colors.primary : Colors.textSecondary
              }
            />
          </Pressable>
        </View>
      )}

      <TaskFilterModal
        visible={filterMenuOpen}
        onClose={() => setFilterMenuOpen(false)}
        showCompleted={showCompleted}
        onPersistShowCompleted={persistShowCompleted}
        filterUserIds={filterUserIds}
        onToggleUserFilter={toggleUserFilter}
        assignableMembers={homeAssignableMembers}
        showCollaboratorFilter={showCollaboratorFilter}
      />

      {displayGroups.length === 0 ? (
        <EmptyState
          title="No tasks"
          message="Click + to add your first task"
        />
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          <Wrapper {...wrapperProps}>
            {/* Hooks into the lifted DndContext (HomeDndProvider). Renders
                nothing — pure side-effect to register reorder handlers. */}
            <TaskListDndMonitor
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            />
            {displayGroups.map((group) => {
                const isCollapsed = collapsedGroups.has(group.id);
                return (
                  <View key={group.id} style={styles.group}>
                    <Pressable
                      style={styles.groupHeader}
                      onPress={() => toggleGroupExpansion(group.id)}
                    >
                      <MaterialIcons
                        name="arrow-forward-ios"
                        size={14}
                        color={Colors.textTertiary}
                        style={[
                          styles.expandArrow,
                          !isCollapsed && styles.expandArrowOpen,
                        ]}
                      />
                      <Text
                        style={[
                          styles.groupLabel,
                          group.id === OVERDUE_GROUP_ID && styles.overdueLabel,
                        ]}
                      >
                        {group.label}
                        <Text style={styles.taskCount}>
                          {" "}
                          {isCollapsed
                            ? `(${group.totalCount})`
                            : `${group.completedCount}/${group.totalCount}`}
                        </Text>
                      </Text>
                      {group.id !== OVERDUE_GROUP_ID && onAddTask && (
                        <SectionHeadingAddButton
                          onPress={() =>
                            onAddTask(
                              group.id === UNSCHEDULED_GROUP_ID
                                ? undefined
                                : group.id
                            )
                          }
                          accessibilityLabel={`Add task to ${group.label}`}
                        />
                      )}
                    </Pressable>

                    <View style={styles.divider} />

                    {!isCollapsed && (
                      <SortableContext
                        items={group.tasks.map((t) => t._id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <DroppableGroupBody
                          groupId={group.id}
                          disabled={!group.canDropInto}
                          isEmpty={group.tasks.length === 0}
                        >
                          {group.tasks.map((task) => {
                            const isTicking =
                              timer.isRunning && timer.taskId === task._id;
                            return (
                              <SortableRow
                                key={task._id}
                                task={task}
                                meta={buildMeta(task)}
                                groupId={group.id}
                                isTicking={isTicking}
                                timerStartTime={timer.startTime}
                                canDrag={group.canDrag}
                                displayColor={deriveDisplayColor(task)}
                                durationSec={deriveDurationSec(task)}
                                onSelect={onSelectTask}
                                onToggleComplete={toggleComplete}
                                onToggleTimer={handleToggleTimer}
                                onSetTimeSpent={handleSetTimeSpent}
                                onRequestContextMenu={openContextMenu}
                              />
                            );
                          })}
                        </DroppableGroupBody>
                      </SortableContext>
                    )}
                  </View>
                );
              })}

            {/* DragOverlay is rendered by HomeDndProvider so the dragged
                row can travel cleanly across the task list and calendar. */}
          </Wrapper>

          <Pressable style={styles.loadMore} onPress={handleLoadMore}>
            <Text style={styles.loadMoreText}>Load More</Text>
          </Pressable>
        </ScrollView>
      )}

      {isWeb && contextMenu && (
        <ContextMenuPopover
          x={contextMenu.x}
          y={contextMenu.y}
          onDelete={() => {
            const id = contextMenu.taskId;
            setContextMenu(null);
            handleDelete(id);
          }}
        />
      )}
    </View>
  );
}

interface ContextMenuPopoverProps {
  x: number;
  y: number;
  onDelete: () => void;
}

function ContextMenuPopover({ x, y, onDelete }: ContextMenuPopoverProps) {
  return (
    <div
      style={{
        position: "fixed",
        top: y,
        left: x,
        zIndex: 9999,
        background: Colors.surfaceContainerHigh,
        border: `1px solid ${Colors.outlineVariant}`,
        borderRadius: 8,
        boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
        minWidth: 180,
        padding: 4,
        overflow: "hidden",
      }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        onClick={onDelete}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          padding: "10px 14px",
          background: "transparent",
          border: "none",
          color: Colors.text,
          fontSize: 14,
          textAlign: "left",
          cursor: "pointer",
          borderRadius: 6,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "rgba(255,255,255,0.06)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.background =
            "transparent";
        }}
      >
        <MaterialIcons name="delete" size={18} color={Colors.text} />
        <span>Delete task</span>
      </button>
    </div>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  loadingText: { color: Colors.textSecondary, fontSize: 16 },
  // Flat header — no surface fill, no bottom rule. Section identity comes
  // from the title typography + spacing (Req 1: single-surface layout).
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    flex: 1,
    minWidth: 0,
  },
  filterIconBtn: { padding: 4 },
  listContent: { padding: 16, paddingBottom: 80 },
  group: { marginBottom: 20 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
    ...Platform.select({
      web: { cursor: "pointer" } as any,
      default: {},
    }),
  },
  expandArrow: {
    marginRight: 4,
    ...Platform.select({
      web: { transition: "transform 150ms ease" } as any,
      default: {},
    }),
  },
  expandArrowOpen: {
    transform: [{ rotate: "90deg" }],
  },
  groupLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
  overdueLabel: { color: Colors.error },
  taskCount: {
    fontWeight: "400",
    color: Colors.textTertiary,
    fontSize: 13,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginBottom: 8,
    marginTop: 4,
  },
  emptyDropZone: {
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.2)",
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    marginBottom: 6,
  },
  emptyDropZoneText: {
    fontSize: 13,
    fontStyle: "italic",
    color: Colors.textTertiary,
  },
  loadMore: {
    alignItems: "center",
    paddingVertical: 16,
  },
  loadMoreText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
});
