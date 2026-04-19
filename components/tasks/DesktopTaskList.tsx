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
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
  rectIntersection,
  pointerWithin,
  useDroppable,
  CollisionDetection,
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

/* ─────────────────────────────  Sortable Row  ───────────────────────────── */

interface SortableRowProps {
  task: TaskRowTask;
  meta: TaskRowMeta;
  groupId: string;
  isTicking: boolean;
  timerElapsed: number;
  canDrag: boolean;
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
  onSelect,
  onToggleComplete,
  onToggleTimer,
  onSetTimeSpent,
  onRequestContextMenu,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task._id,
    data: { type: "task", groupId, task },
    disabled: !canDrag,
  });

  const style: any = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: "100%",
  };

  return (
    <div ref={setNodeRef} style={style}>
      {isDragging ? (
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
          dragHandleProps={
            canDrag
              ? ({ ...attributes, ...listeners } as Record<string, unknown>)
              : undefined
          }
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
  const today = todayYYYYMMDD();
  const [visibleDays, setVisibleDays] = useState(7);
  const visibleEndDay = addDays(today, visibleDays - 1);

  const tasks = useQuery(api.tasks.search, { includeCompleted: true });
  const tags = useQuery(api.tags.search, {});
  const lists = useQuery(api.lists.search, {});
  const trackables = useQuery(api.trackables.search, {});
  const upsertTask = useMutation(api.tasks.upsert);
  const removeTask = useMutation(api.tasks.remove);
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

  /* Group tasks (server-authoritative) */
  const serverGroups = useMemo(() => {
    if (!tasks) return [] as { id: string; tasks: TaskRowTask[] }[];
    const groups = new Map<string, TaskRowTask[]>();
    let hasFuture = false;

    for (const task of tasks as any as TaskRowTask[]) {
      const day = task.taskDay;
      if (!day) {
        if (!groups.has(UNSCHEDULED_GROUP_ID))
          groups.set(UNSCHEDULED_GROUP_ID, []);
        groups.get(UNSCHEDULED_GROUP_ID)!.push(task);
        continue;
      }

      if (day > visibleEndDay && !task.dateCompleted) {
        hasFuture = true;
        continue;
      }

      if (
        !task.dateCompleted &&
        isPast(day) &&
        !isToday(day)
      ) {
        if (!groups.has(OVERDUE_GROUP_ID))
          groups.set(OVERDUE_GROUP_ID, []);
        groups.get(OVERDUE_GROUP_ID)!.push(task);
      } else {
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day)!.push(task);
      }
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => {
      if (a === OVERDUE_GROUP_ID) return -1;
      if (b === OVERDUE_GROUP_ID) return 1;
      if (a === UNSCHEDULED_GROUP_ID) return 1;
      if (b === UNSCHEDULED_GROUP_ID) return -1;
      return a.localeCompare(b);
    });

    // Always show the visible day range (today..today+visibleDays-1) even when empty.
    const requiredDays = new Set<string>();
    for (let i = 0; i < visibleDays; i++) {
      requiredDays.add(addDays(today, i));
    }
    for (const d of requiredDays) {
      if (!groups.has(d)) {
        groups.set(d, []);
        sortedKeys.push(d);
      }
    }
    sortedKeys.sort((a, b) => {
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
    const result = sortedKeys.map((id) => ({
      id,
      tasks: (groups.get(id) ?? []).sort((a, b) => {
        const aCompleted = a.dateCompleted ? 1 : 0;
        const bCompleted = b.dateCompleted ? 1 : 0;
        if (aCompleted !== bCompleted) return aCompleted - bCompleted;
        return (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0);
      }),
    }));

    return result;
  }, [tasks, visibleEndDay, today, visibleDays]);

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
        canDrop:
          g.id !== OVERDUE_GROUP_ID && g.id !== UNSCHEDULED_GROUP_ID,
      };
    });
  }, [localGroups, showCompleted]);

  /* ───── Mutations ───── */
  const toggleComplete = useCallback(
    async (taskId: Id<"tasks">) => {
      const task = (tasks as any as TaskRowTask[] | undefined)?.find(
        (t) => t._id === taskId
      );
      if (!task) return;

      const wasCompleted = !!task.dateCompleted;
      if (!wasCompleted && timer.isRunning && timer.taskId === taskId) {
        await timer.stop();
      }
      await upsertTask({
        id: taskId,
        name: task.name,
        // `null` clears the field server-side; a string sets it to today.
        dateCompleted: wasCompleted ? null : todayYYYYMMDD(),
      });
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
      await removeTask({ id: taskId });
    },
    [removeTask]
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

  /* ───── DnD ───── */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  const customCollisionDetection: CollisionDetection = useCallback(
    (args) => {
      // Prefer exact pointer-within first (matches the cursor precisely).
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) {
        return pointerCollisions;
      }
      const rectCollisions = rectIntersection(args);
      if (rectCollisions.length > 0) {
        return rectCollisions;
      }
      return closestCenter(args);
    },
    []
  );

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

  const toggleGroupExpansion = useCallback((groupId: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  const handleLoadMore = useCallback(() => {
    setVisibleDays((d) => d + LOAD_MORE_DAYS);
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

  const activeDragMeta = activeDrag ? buildMeta(activeDrag.task) : null;
  const activeDragIsTicking =
    !!activeDrag && timer.isRunning && timer.taskId === activeDrag.task._id;

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {onAddTask && (
            <Pressable
              onPress={() => onAddTask(today)}
              hitSlop={8}
              style={styles.headerAddBtn}
            >
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
            </Pressable>
          )}
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
            <DndContext
              sensors={sensors}
              collisionDetection={customCollisionDetection}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
              onDragCancel={onDragCancel}
            >
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
                          disabled={!group.canDrop}
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
                                canDrag={group.canDrop}
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

              <DragOverlay>
                {activeDrag && activeDragMeta ? (
                  <TaskRowDesktop
                    task={activeDrag.task}
                    meta={activeDragMeta}
                    isTicking={activeDragIsTicking}
                    timerElapsedSeconds={timer.elapsed}
                    isOverlay
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
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
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  headerAddBtn: {
    padding: 4,
  },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
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
