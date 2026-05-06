import React, {
  useState,
  useMemo,
  useCallback,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Switch,
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
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDate,
  isToday,
  isPast,
} from "../../lib/dates";
import { useTimer } from "../../hooks/useTimer";
import { useAuth } from "../../hooks/useAuth";
import { EmptyState } from "../ui/EmptyState";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
  TaskDragPlaceholder,
} from "./TaskRowDesktop";

const isWeb = Platform.OS === "web";
const LOAD_MORE_DAYS = 7;
const OVERDUE_GROUP_ID = "overdue";
const UNSCHEDULED_GROUP_ID = "unscheduled";

interface DesktopTaskListProps {
  title?: string;
  onAddTask?: (day?: string) => void;
  onSelectTask?: (taskId: Id<"tasks">) => void;
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
  timerElapsed: number;
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
  timerElapsed,
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
          timerElapsedSeconds={timerElapsed}
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
    disabled,
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
}: DesktopTaskListProps) {
  const { profileReady } = useAuth();
  const today = todayYYYYMMDD();
  // Server-driven pagination. Initial render = today only (rangeEndDays=0).
  // Each "Load More" click extends the window by 7 days into the future,
  // triggering a fresh query – we never preload future days client-side.
  const [rangeEndDays, setRangeEndDays] = useState(0);
  const visibleEndDay = addDays(today, rangeEndDays);

  const tasks = useQuery(
    api.tasks.getHomeTasks,
    profileReady
      ? {
          todayYYYYMMDD: today,
          rangeEndYYYYMMDD: visibleEndDay,
        }
      : "skip",
  );
  const tags = useQuery(api.tags.search, profileReady ? {} : "skip");
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const trackables = useQuery(api.trackables.search, profileReady ? {} : "skip");
  const recurringRules = useQuery(
    api.recurringTasks.list,
    profileReady ? {} : "skip",
  );

  /* ──────────────────  Recurring instance materialization  ──────────────────
   * Recurring tasks live as a single `recurringTasks` rule plus zero-to-many
   * materialized `tasks` rows (one per occurrence). Materialization is lazy:
   * the home page calls `generateInstances(today, visibleEndDay)` whenever
   * its window changes, and the mutation idempotently fills any missing
   * `(ruleId, taskDay)` rows. Once the rows exist, the reactive
   * `getHomeTasks` query above pulls them in like any other task — no
   * synthetic-id branches anywhere downstream.
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
      rangeStartYYYYMMDD: today,
      rangeEndYYYYMMDD: visibleEndDay,
    });
    // We intentionally key on the *content* of the rules array, not the
    // identity, so a rule mutation immediately re-materializes — but a
    // re-render with no rule change is a no-op.
  }, [
    today,
    visibleEndDay,
    recurringRules?.length,
    recurringRules?.map((r) => r._id).join(","),
    generateInstances,
  ]);
  // Optimistic update: when `upsert` is called with an existing `id`, patch the
  // matching task in every active `getHomeTasks` subscription synchronously so
  // the UI updates in <1 frame. The server response will reconcile when it
  // arrives. INSERT (no id) skips optimistic – the server has to assign the
  // id, and create is rarely on the perceived-latency critical path.
  const upsertTask = useMutation(api.tasks.upsert).withOptimisticUpdate(
    (localStore, args) => {
      if (!args.id) return;
      const queries = localStore.getAllQueries(api.tasks.getHomeTasks);
      for (const q of queries) {
        const value = q.value;
        if (!value) continue;
        const idx = value.findIndex((t) => t._id === args.id);
        if (idx === -1) continue;

        const existing = value[idx];
        const patched = { ...existing };
        if (args.name !== undefined) patched.name = args.name;
        if (args.dateCompleted !== undefined) {
          // null on the wire → clear the field on the doc
          patched.dateCompleted = args.dateCompleted ?? undefined;
        }
        if (args.taskDay !== undefined) patched.taskDay = args.taskDay;
        if (args.taskDayOrderIndex !== undefined) {
          patched.taskDayOrderIndex = args.taskDayOrderIndex;
        }
        if (args.listId !== undefined) patched.listId = args.listId;
        if (args.dueDateYYYYMMDD !== undefined) {
          patched.dueDateYYYYMMDD = args.dueDateYYYYMMDD;
        }
        if (args.timeSpentInSecondsUnallocated !== undefined) {
          patched.timeSpentInSecondsUnallocated =
            args.timeSpentInSecondsUnallocated;
        }
        if (args.tagIds !== undefined) patched.tagIds = args.tagIds;

        const next = [...value];
        next[idx] = patched;
        localStore.setQuery(api.tasks.getHomeTasks, q.args, next);
      }
    }
  );
  const removeTask = useMutation(api.tasks.remove);
  // Recurring-instance delete uses a dedicated mutation that adds the date
  // to `deletedRecurringOccurrences` (the skip set) before removing the
  // task row, so the next `generateInstances` call doesn't recreate it.
  const deleteRecurringInstance = useMutation(
    api.recurringTasks.deleteInstance
  );
  const moveOnDay = useMutation(api.tasks.moveOnDay);
  const moveBetweenDays = useMutation(api.tasks.moveBetweenDays);
  const setTimeSpentMutation = useMutation(api.tasks.setTimeSpent);
  const timer = useTimer();

  const [showCompleted, setShowCompleted] = useState(true);
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

  /* Group tasks (server-authoritative).
   *
   * Server already constrained the payload to:
   *   - overdue (incomplete + non-recurring + taskDay < today)
   *   - tasks scheduled in [today, visibleEndDay]
   *   - tasks completed in [today, visibleEndDay]
   * so we only need to bucket them, not filter for date range or recurrence.
   */
  const serverGroups = useMemo(() => {
    if (!tasks) return [] as { id: string; tasks: TaskRowTask[] }[];
    const groups = new Map<string, TaskRowTask[]>();

    for (const task of tasks as any as TaskRowTask[]) {
      const day = task.taskDay;
      if (!day) {
        if (!groups.has(UNSCHEDULED_GROUP_ID))
          groups.set(UNSCHEDULED_GROUP_ID, []);
        groups.get(UNSCHEDULED_GROUP_ID)!.push(task);
        continue;
      }

      if (!task.dateCompleted && isPast(day) && !isToday(day)) {
        if (!groups.has(OVERDUE_GROUP_ID))
          groups.set(OVERDUE_GROUP_ID, []);
        groups.get(OVERDUE_GROUP_ID)!.push(task);
      } else {
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day)!.push(task);
      }
    }

    // Always show every day in the visible window, even if empty,
    // so users have an obvious target for adding/scheduling tasks.
    for (let i = 0; i <= rangeEndDays; i++) {
      const d = addDays(today, i);
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
     * Match productivity-one's `compareTasksForDay`:
     * incomplete tasks (0) sort before completed tasks (1); within each
     * partition we preserve the server's `taskDayOrderIndex`.
     */
    return sortedKeys.map((id) => ({
      id,
      tasks: (groups.get(id) ?? []).sort((a, b) => {
        const aCompleted = a.dateCompleted ? 1 : 0;
        const bCompleted = b.dateCompleted ? 1 : 0;
        if (aCompleted !== bCompleted) return aCompleted - bCompleted;
        return (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0);
      }),
    }));
  }, [tasks, today, rangeEndDays]);

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

  /* Build display groups (filter completed if needed) */
  const displayGroups = useMemo(() => {
    return localGroups.map((g) => {
      const allTasks = g.tasks;
      const completedCount = allTasks.filter((t) => !!t.dateCompleted).length;
      const visibleTasks = showCompleted
        ? allTasks
        : allTasks.filter((t) => !t.dateCompleted);

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
        totalCount: allTasks.length,
        // Per-group drag rules are deliberately asymmetric:
        //
        //   group         | canDrag | canDropInto
        //   --------------+---------+------------
        //   Overdue       |  yes    |   no
        //   Unscheduled   |  no     |   no
        //   Today/future  |  yes    |   yes
        //
        // Overdue tasks must be draggable so the user can move them onto
        // a real day (or the calendar) — but Overdue is a virtual bucket,
        // not a target a task should ever land in. Likewise Unscheduled
        // is a passive bucket today (no drag yet); both are blocked as
        // drop targets in `onDragOver`/`onDragEnd`, and the underlying
        // `useDroppable` is also disabled below so collision detection
        // skips them entirely.
        canDrag: g.id !== UNSCHEDULED_GROUP_ID,
        canDropInto:
          g.id !== OVERDUE_GROUP_ID && g.id !== UNSCHEDULED_GROUP_ID,
      };
    });
  }, [localGroups, showCompleted]);

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
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timer.startForTask(taskId, tz);
      }
    },
    [timer]
  );

  const handleDelete = useCallback(
    async (taskId: Id<"tasks">) => {
      // Route recurring-instance deletes through the skip-set-aware
      // mutation; everything else uses the normal cascade delete.
      const task = tasks?.find((t) => t._id === taskId);
      if (task?.isRecurringInstance && task.recurringTaskId) {
        await deleteRecurringInstance({ taskId });
      } else {
        await removeTask({ id: taskId });
      }
    },
    [removeTask, deleteRecurringInstance, tasks]
  );

  const handleSetTimeSpent = useCallback(
    async (taskId: Id<"tasks">, newSeconds: number) => {
      const safe = Math.max(0, Math.floor(newSeconds));
      await setTimeSpentMutation({
        taskId,
        timeSpentInSecondsUnallocated: safe,
      });
    },
    [setTimeSpentMutation]
  );

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
      // Hovering the calendar — do nothing here; CalendarView paints the
      // preview and the cross-group optimistic logic below would only
      // confuse the user (task would jump out of its current day).
      if (isCalendarDrop(overId)) return;

      const activeLoc = findTaskLocation(activeId);
      if (!activeLoc) return;

      // Determine target group + insertion index based on what we're over.
      let targetGroupId: string;
      let targetIndex: number;

      const overData = over.data.current as
        | { type?: string; groupId?: string }
        | undefined;

      if (overData?.type === "group" && overData.groupId) {
        targetGroupId = overData.groupId;
        const targetGroup = localGroups.find((g) => g.id === targetGroupId);
        targetIndex = targetGroup ? targetGroup.tasks.length : 0;
      } else {
        // We're over another sortable task.
        const overLoc = findTaskLocation(overId);
        if (!overLoc) return;
        targetGroupId = overLoc.groupId;
        targetIndex = overLoc.index;
      }

      // Block dropping into Overdue or Unscheduled.
      if (
        targetGroupId === OVERDUE_GROUP_ID ||
        targetGroupId === UNSCHEDULED_GROUP_ID
      ) {
        return;
      }

      // CRITICAL: only mutate local state on cross-container moves. Same-group
      // reordering is handled visually by `SortableContext` + the vertical
      // sorting strategy (CSS transforms) and committed in `onDragEnd`.
      // Otherwise we get a swap-with-neighbour ping-pong: the cursor stays on
      // the item we just displaced, which retriggers the same arrayMove and
      // bounces forever — manifesting as "Maximum update depth exceeded".
      if (activeLoc.groupId === targetGroupId) return;

      setLocalGroups((prev) => {
        const next = prev.map((g) => ({ ...g, tasks: g.tasks.slice() }));
        const fromGroup = next.find((g) => g.id === activeLoc.groupId)!;
        const toGroup = next.find((g) => g.id === targetGroupId)!;
        const [moved] = fromGroup.tasks.splice(activeLoc.index, 1);
        // Clamp target index in case the source removal shifted things.
        const insertAt = Math.min(targetIndex, toGroup.tasks.length);
        toGroup.tasks.splice(insertAt, 0, moved);
        return next;
      });
    },
    [findTaskLocation, localGroups]
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const startInfo = activeDrag;
      setActiveDrag(null);
      isDraggingRef.current = false;
      if (!startInfo) return;

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

      // Same-group reordering is committed here via arrayMove — onDragOver
      // intentionally skipped same-group moves to avoid an infinite swap
      // ping-pong with the SortableContext's transform-based animations.
      let toDay = currentLoc.groupId;
      let newOrderIndex = currentLoc.index;

      if (over) {
        const overId = String(over.id);
        const overData = over.data.current as
          | { type?: string; groupId?: string }
          | undefined;

        if (overData?.type === "group" && overData.groupId) {
          toDay = overData.groupId;
          if (toDay === currentLoc.groupId) {
            // Drop into the empty area of the same group → move to the end.
            const groupLen =
              localGroups.find((g) => g.id === toDay)?.tasks.length ?? 0;
            newOrderIndex = Math.max(0, groupLen - 1);
          } else {
            const groupLen =
              localGroups.find((g) => g.id === toDay)?.tasks.length ?? 0;
            newOrderIndex = groupLen;
          }
        } else if (overId !== taskId) {
          // Hovering over another sortable task.
          const overLoc = findTaskLocation(overId);
          if (overLoc && overLoc.groupId === currentLoc.groupId) {
            toDay = overLoc.groupId;
            newOrderIndex = overLoc.index;
          }
        }
      }

      // Apply the same-group reorder optimistically before persisting.
      if (
        toDay === currentLoc.groupId &&
        currentLoc.index !== newOrderIndex
      ) {
        setLocalGroups((prev) =>
          prev.map((g) =>
            g.id !== toDay
              ? g
              : {
                  ...g,
                  tasks: arrayMove(g.tasks, currentLoc.index, newOrderIndex),
                }
          )
        );
      }

      const fromDay = startInfo.fromGroupId;

      // No-op
      if (fromDay === toDay && startInfo.fromIndex === newOrderIndex) {
        return;
      }
      // Disallow drop targets
      if (toDay === OVERDUE_GROUP_ID || toDay === UNSCHEDULED_GROUP_ID) {
        // Revert local state by re-syncing on next query update.
        setLocalGroups(serverGroups);
        return;
      }

      try {
        if (fromDay === toDay) {
          await moveOnDay({
            taskId,
            day: toDay,
            newOrderIndex,
          });
        } else {
          await moveBetweenDays({
            taskId,
            fromDay,
            toDay,
            newOrderIndex,
          });
        }
      } catch (err) {
        // Revert by resyncing
        setLocalGroups(serverGroups);
        // eslint-disable-next-line no-console
        console.error("Task move failed", err);
      }
    },
    [
      activeDrag,
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
        </View>
      )}

      <View style={styles.filterBar}>
        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Show completed</Text>
          <Switch
            value={showCompleted}
            onValueChange={setShowCompleted}
            trackColor={{
              false: Colors.outlineVariant,
              true: Colors.primary + "60",
            }}
            thumbColor={
              showCompleted ? Colors.primary : Colors.textTertiary
            }
          />
        </View>
      </View>

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
                        <Pressable
                          onPress={(e) => {
                            e.stopPropagation?.();
                            onAddTask(
                              group.id === UNSCHEDULED_GROUP_ID
                                ? undefined
                                : group.id
                            );
                          }}
                          hitSlop={8}
                          style={styles.addButton}
                        >
                          <Ionicons name="add" size={20} color={Colors.text} />
                        </Pressable>
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
                                timerElapsed={timer.elapsed}
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
            void handleDelete(id);
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  filterLabel: { fontSize: 14, color: Colors.textSecondary },
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
  addButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
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
