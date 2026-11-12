import { FontSize, Radius } from "../../theme/tokens";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { Pressable as GesturePressable } from "react-native-gesture-handler";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../ui/EmptyState";
import { SkeletonRows } from "../ui/SkeletonRows";
import { SectionHeadingAddButton } from "../ui/SectionHeadingAddButton";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDate,
  isToday,
  getDaysInRange,
} from "../../lib/dates";
import { moveOverdueTaskToTodayOnTimerStart } from "../../lib/moveOverdueTaskToTodayOnTimerStart";
import { compareTasksForDay } from "../../convex/_helpers/compareTasksForDay";
import { maxOrderPlusOne, toIndexAfterFlatMove } from "../../convex/_helpers/orderShift";
import { useTimer } from "../../hooks/useTimer";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useTaskUpsertMutation } from "../../hooks/useTaskUpsertMutation";
import { useTaskDeleteMutation } from "../../hooks/useTaskDeleteMutation";
import { useTaskMoveMutations } from "../../hooks/useTaskMoveMutations";
import { SwipeableTaskRow } from "../tasks/SwipeableTaskRow";
import { TaskFilterModal } from "../tasks/TaskFilterModal";
import type { TaskFilterMember } from "../../lib/taskFilters";

/** True for a dated group that falls before today (it holds overdue tasks). */
function isPastDayGroup(day: string, today: string): boolean {
  return /^\d/.test(day) && day < today;
}

const NO_FILTER_USERS: string[] = [];
const NO_FILTER_MEMBERS: TaskFilterMember[] = [];
const noopToggleUserFilter = () => {};
import { TaskTimeSpentButton } from "../tasks/TaskTimeSpentButton";
import { useTaskTimeSpentEditor } from "../tasks/useTaskTimeSpentEditor";
import { Id } from "../../convex/_generated/dataModel";
import {
  nextOverdueWeeksLoaded,
  overdueCutoffDay,
  splitOverdueByCutoff,
} from "../../lib/overdueWindow";

const LOAD_MORE_DAYS = 7;
const isWeb = Platform.OS === "web";

interface TaskListProps {
  title?: string;
  onAddTask?: (day?: string) => void;
  onSelectTask?: (taskId: Id<"tasks">) => void;
}

export function TaskList({ title, onAddTask, onSelectTask }: TaskListProps) {
  const isDesktop = useIsDesktop();
  const { profileReady } = useAuth();
  const today = todayYYYYMMDD();
  /**
   * Mobile mirrors desktop's window model (see `DesktopTaskList`): the server
   * returns Overdue + scheduled-in-window + completed-in-window. Initial window
   * is just today; Load More extends it by `LOAD_MORE_DAYS` future days. The
   * client never holds days that weren't requested (no rendering 2 months of
   * past recurring instances).
   */
  const [visibleDays, setVisibleDays] = useState(1);
  const visibleEndDay = addDays(today, visibleDays - 1);

  const queryTasks = useQuery(
    api.tasks.getHomeTasks,
    profileReady
      ? { todayYYYYMMDD: today, rangeEndYYYYMMDD: visibleEndDay }
      : "skip",
  );

  /**
   * Load-more retention (parity with `DesktopTaskList`): while the wider
   * `getHomeTasks` payload is in flight after bumping `visibleDays`,
   * `useQuery` briefly returns `undefined`. Without retention that made
   * the whole list unmount and flash "Loading tasks..." — exactly the
   * "screen refreshes" behaviour reported on mobile. We keep the last
   * good payload alive so the visible list only *grows* on Load More.
   */
  const lastStableTasksRef = useRef<{
    today: string;
    rangeEnd: string;
    tasks: NonNullable<typeof queryTasks>;
  } | null>(null);

  useEffect(() => {
    if (queryTasks !== undefined) {
      lastStableTasksRef.current = {
        today,
        rangeEnd: visibleEndDay,
        tasks: queryTasks,
      };
    }
  }, [queryTasks, today, visibleEndDay]);

  const tasks = useMemo(() => {
    if (queryTasks !== undefined) return queryTasks;
    // Hold onto the previously-loaded rows while a wider window is being
    // fetched. Only reuse if today hasn't rolled over and the new window
    // is a *forward* expansion (never shrink or shift the anchor).
    const prev = lastStableTasksRef.current;
    if (
      prev &&
      prev.today === today &&
      visibleEndDay.localeCompare(prev.rangeEnd) >= 0
    ) {
      return prev.tasks;
    }
    return undefined;
  }, [queryTasks, today, visibleEndDay]);
  const tags = useQuery(api.tags.search, profileReady ? {} : "skip");
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const trackables = useQuery(api.trackables.search, profileReady ? {} : "skip");
  const recurringRules = useQuery(
    api.recurringTasks.list,
    profileReady ? {} : "skip",
  );

  /* ──────────────────  Recurring instance materialization  ──────────────────
   * Same lazy materialization as `DesktopTaskList`: recurring occurrences
   * only exist as `tasks` rows after `generateInstances` runs for a date
   * window. Without this, Load More widened the query range but the new
   * days had no materialized instances — recurring tasks (e.g. daily
   * workout / review) never appeared on mobile's future days.
   *
   * Idempotent: the mutation de-dupes on `(recurringTaskId, taskDay)`, so
   * firing on every window change / rule edit cannot create duplicates.
   */
  const generateInstances = useMutation(api.recurringTasks.generateInstances);
  useEffect(() => {
    // Wait for the rules subscription so the first call isn't a no-op
    // that immediately re-fires once rules resolve.
    if (!profileReady || recurringRules === undefined) return;
    void generateInstances({
      rangeStartYYYYMMDD: today,
      rangeEndYYYYMMDD: visibleEndDay,
    });
    // Keyed on rule *content* (not array identity) so editing/creating a
    // rule re-materializes immediately, but plain re-renders are no-ops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profileReady,
    today,
    visibleEndDay,
    recurringRules?.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    recurringRules?.map((r) => r._id).join(","),
    generateInstances,
  ]);
  const upsertTask = useTaskUpsertMutation();
  const deleteTask = useTaskDeleteMutation();
  const { moveOnDay, moveBetweenDays } = useTaskMoveMutations();
  // Tap-to-edit time spent — ALL task surfaces share this hook so the
  // mutation, optimistic update, and dialog behave identically.
  const { openTimeSpentEditor, timeSpentDialog } = useTaskTimeSpentEditor();
  const timer = useTimer();

  const [showCompleted, setShowCompleted] = useState(true);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  /** Weeks of overdue history shown; older tasks sit behind "Load previous week". */
  const [overdueWeeksLoaded, setOverdueWeeksLoaded] = useState(1);
  const overdueCutoff = overdueCutoffDay(today, overdueWeeksLoaded);
  const [dragOverTarget, setDragOverTarget] = useState<{
    day: string;
    index: number;
    orderIndex: number;
    /** Row the drop lands above; `null` appends to the day. */
    taskId: string | null;
  } | null>(null);

  const dragDataRef = useRef<{
    taskId: string;
    sourceDay: string;
    sourceOrderIndex: number;
  } | null>(null);
  const dragOverTargetRef = useRef<{
    day: string;
    index: number;
    orderIndex: number;
    taskId: string | null;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  dragOverTargetRef.current = dragOverTarget;

  const tagMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    tags?.forEach((t) => m.set(t._id, { name: t.name, colour: t.colour }));
    return m;
  }, [tags]);

  const listMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    lists?.forEach((l: any) => m.set(l._id, { name: l.name, colour: l.colour }));
    return m;
  }, [lists]);

  const trackableMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    trackables?.forEach((t: any) =>
      m.set(t._id, { name: t.name, colour: t.colour })
    );
    return m;
  }, [trackables]);

  /**
   * Server-scoped grouping (parity with `DesktopTaskList`'s `serverGroups`):
   *   - Overdue   = any incomplete task with `taskDay < today` (server already
   *                  filtered out recurring instances)
   *   - Day       = scheduled in [today, visibleEndDay], OR completed in that
   *                  window (bucketed by completion date for completed rows)
   *   - Unscheduled = `taskDay` is falsy
   *
   * The server query (`api.tasks.getHomeTasks`) is the source of truth — we
   * don't need a client-side `futureTasksBeyondRange` check because anything
   * outside the requested window never reaches the client.
   */
  /** Overdue tasks older than the loaded window — counted, not rendered. */
  const olderOverdue = useMemo(() => {
    const overdue = (tasks ?? []).filter(
      (t) => !t.dateCompleted && !!t.taskDay && t.taskDay < today,
    );
    const { hiddenCount, newestHiddenDay } = splitOverdueByCutoff(
      overdue,
      overdueCutoff,
    );
    return { hiddenCount, newestHiddenDay };
  }, [tasks, today, overdueCutoff]);

  const groupedTasks = useMemo(() => {
    if (!tasks) return [];
    const groups = new Map<string, typeof tasks>();
    const unscheduledKey = "unscheduled";

    for (const task of tasks) {
      const day = task.taskDay;
      if (task.dateCompleted) {
        const bucket = task.dateCompleted;
        if (!groups.has(bucket)) groups.set(bucket, []);
        groups.get(bucket)!.push(task);
        continue;
      }
      if (!day) {
        if (!groups.has(unscheduledKey)) groups.set(unscheduledKey, []);
        groups.get(unscheduledKey)!.push(task);
        continue;
      }
      // Overdue tasks sit under their own date, like any other day. Days
      // older than the loaded window stay behind "Load previous week".
      if (day < overdueCutoff) {
        continue;
      } else {
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day)!.push(task);
      }
    }

    // Always render every day in the visible window, even when empty, so
    // Load More visibly extends the list forward even when the newly
    // fetched days have no tasks (parity with `DesktopTaskList`'s
    // `serverGroups`). Without this, tapping Load More on a week with
    // no upcoming tasks looks like a no-op.
    for (const d of getDaysInRange(today, visibleEndDay)) {
      if (!groups.has(d)) groups.set(d, []);
    }

    const entries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });

    return entries.flatMap(([day, dayTasks]) => {
      const allTasks = dayTasks.sort(compareTasksForDay);
      const completedCount = allTasks.filter((t) => !!t.dateCompleted).length;
      const visibleTasks = showCompleted
        ? allTasks
        : allTasks.filter((t) => !t.dateCompleted);

      const isPastDay = isPastDayGroup(day, today);
      // Past days only exist to hold their tasks: no empty placeholders.
      if (isPastDay && visibleTasks.length === 0) return [];

      return [{
        day,
        isPastDay,
        /** A past day that still has open tasks: its date reads as overdue. */
        isOverdueDay: isPastDay && visibleTasks.some((t) => !t.dateCompleted),
        nextOrderIndex: maxOrderPlusOne(allTasks.map((t) => t.taskDayOrderIndex)),
        label:
          day === "unscheduled"
              ? "Unscheduled"
              : isToday(day)
                ? "Today"
                : formatDisplayDate(day),
        tasks: visibleTasks,
        completedCount,
        totalCount: allTasks.length,
      }];
    });
  }, [tasks, showCompleted, today, visibleEndDay, overdueCutoff]);

  const isGroupCollapsed = useCallback(
    (day: string, _visibleCount: number) => collapsedGroups.has(day),
    [collapsedGroups],
  );

  const handleLoadPreviousOverdueWeek = useCallback(() => {
    setOverdueWeeksLoaded((weeks) =>
      nextOverdueWeeksLoaded(today, weeks, olderOverdue.newestHiddenDay),
    );
  }, [today, olderOverdue.newestHiddenDay]);

  const toggleComplete = useCallback(
    async (taskId: Id<"tasks">, taskName: string, isCompleted: boolean) => {
      if (!isCompleted && timer.isRunning && timer.taskId === taskId) {
        timer.stop();
      }
      await upsertTask({
        id: taskId,
        name: taskName,
        // `null` clears the field server-side; omitted/`undefined` leaves it unchanged.
        dateCompleted: isCompleted ? null : todayYYYYMMDD(),
      });
    },
    [upsertTask, timer]
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
          today,
        );
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        timer.startForTask(taskId, tz);
      }
    },
    [timer, tasks, moveBetweenDays, today]
  );

  const handleLoadMore = useCallback(() => {
    setVisibleDays((d) => d + LOAD_MORE_DAYS);
  }, []);

  /**
   * Flattened row model for the native single-list drag implementation.
   *
   * Why flatten?
   *   Earlier we used one `NestableDraggableFlatList` per day. That made cross-
   *   day drags impossible — each list only "owned" its own rows. To allow
   *   dragging a task from one day's section into another, we collapse every
   *   group into one flat data array containing `header`, `task` and
   *   `empty-placeholder` rows, render it as a single draggable list, and
   *   reconstruct the destination day on drop by walking back to the nearest
   *   preceding header row.
   */
  type FlatRow =
    | {
        kind: "header";
        day: string;
        label: string;
        completedCount: number;
        totalCount: number;
        isCollapsed: boolean;
        isPastDay: boolean;
        isOverdueDay: boolean;
      }
    | {
        kind: "task";
        task: NonNullable<typeof tasks>[number];
        day: string;
        indexInDay: number;
      }
    | { kind: "empty-placeholder"; day: string }
    | { kind: "load-previous-overdue"; day: string; hiddenCount: number };

  const flatRows = useMemo<FlatRow[]>(() => {
    const out: FlatRow[] = [];
    // Older overdue days load a week at a time, mirroring "Load More".
    if (olderOverdue.hiddenCount > 0) {
      out.push({
        kind: "load-previous-overdue",
        day: "older",
        hiddenCount: olderOverdue.hiddenCount,
      });
    }
    for (const group of groupedTasks) {
      const isCollapsed = isGroupCollapsed(group.day, group.tasks.length);
      out.push({
        kind: "header",
        day: group.day,
        label: group.label,
        completedCount: group.completedCount,
        totalCount: group.totalCount,
        isCollapsed,
        isPastDay: group.isPastDay,
        isOverdueDay: group.isOverdueDay,
      });
      if (isCollapsed) continue;
      const isValidDropDay = !group.isPastDay && group.day !== "unscheduled";
      if (group.tasks.length === 0 && isValidDropDay) {
        out.push({ kind: "empty-placeholder", day: group.day });
      }
      group.tasks.forEach((task, i) => {
        out.push({ kind: "task", task, day: group.day, indexInDay: i });
      });
    }
    return out;
  }, [groupedTasks, isGroupCollapsed, olderOverdue.hiddenCount]);

  const toggleGroupExpansion = useCallback((day: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    async (
      targetDay: string,
      toIndex: number,
      insertAboveId: string | null,
    ) => {
      const drag = dragDataRef.current;
      if (!drag) return;
      dragDataRef.current = null;
      setDragOverTarget(null);

      const taskId = drag.taskId as Id<"tasks">;
      const sourceTask = tasks?.find((t) => t._id === taskId);
      const fromDay =
        drag.sourceDay === "unscheduled"
          ? (sourceTask?.taskDay ?? drag.sourceDay)
          : drag.sourceDay;
      const insertAboveTaskId = (insertAboveId ?? null) as Id<"tasks"> | null;
      if (fromDay === targetDay) {
        if (insertAboveTaskId !== taskId) {
          await moveOnDay({
            taskId,
            day: targetDay,
            insertAboveTaskId,
            toIndex,
          });
        }
      } else {
        await moveBetweenDays({
          taskId,
          fromDay,
          toDay: targetDay,
          insertAboveTaskId,
          toIndex,
        });
      }
    },
    [moveOnDay, moveBetweenDays, tasks]
  );

  useEffect(() => {
    if (!isWeb || !scrollRef.current) return;
    const el = scrollRef.current as unknown as HTMLElement;
    if (!el || !el.addEventListener) return;

    const onDragStart = (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest?.(
        "[data-drag-task-id]"
      ) as HTMLElement | null;
      if (!card) return;
      dragDataRef.current = {
        taskId: card.dataset.dragTaskId!,
        sourceDay: card.dataset.dragDay!,
        sourceOrderIndex: parseInt(card.dataset.dragOrder!, 10),
      };
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", card.dataset.dragTaskId!);
        e.dataTransfer.setData(
          "application/x-task",
          JSON.stringify(dragDataRef.current)
        );
      }
      requestAnimationFrame(() => {
        card.style.opacity = "0.4";
      });
    };

    const onDragEnd = (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest?.(
        "[data-drag-task-id]"
      ) as HTMLElement | null;
      if (card) card.style.opacity = "1";
      dragDataRef.current = null;
      setDragOverTarget(null);
    };

    const onDragOver = (e: DragEvent) => {
      const card = (e.target as HTMLElement).closest?.(
        "[data-drag-task-id]"
      ) as HTMLElement | null;
      const group = (e.target as HTMLElement).closest?.(
        "[data-drop-day]"
      ) as HTMLElement | null;
      if (!group) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "move";

      if (card && card.dataset.dragTaskId !== dragDataRef.current?.taskId) {
        setDragOverTarget({
          day: card.dataset.dragDay!,
          index: parseInt(card.dataset.dragIndex!, 10),
          orderIndex: parseInt(card.dataset.dragOrder!, 10),
          taskId: card.dataset.dragTaskId ?? null,
        });
      } else {
        setDragOverTarget({
          day: group.dataset.dropDay!,
          index: parseInt(group.dataset.dropCount ?? "0", 10),
          orderIndex: parseInt(group.dataset.dropNextOrder ?? "0", 10),
          taskId: null,
        });
      }
    };

    const onDragLeave = (e: DragEvent) => {
      const related = e.relatedTarget as HTMLElement | null;
      if (!related || !el.contains(related)) {
        setDragOverTarget(null);
      }
    };

    const onDropHandler = (e: DragEvent) => {
      e.preventDefault();
      const group = (e.target as HTMLElement).closest?.(
        "[data-drop-day]"
      ) as HTMLElement | null;
      if (!group) return;

      const draggedId = dragDataRef.current?.taskId;
      const targetDay = group.dataset.dropDay!;
      const isDestCard = (el: HTMLElement | null): el is HTMLElement =>
        !!el &&
        el.dataset.dragTaskId !== draggedId &&
        el.dataset.dragDay === targetDay;
      const cardFromTarget = (e.target as HTMLElement).closest?.(
        "[data-drag-task-id]"
      ) as HTMLElement | null;
      const cardFromPoint = document
        .elementsFromPoint(e.clientX, e.clientY)
        .map((node) =>
          (node as HTMLElement).closest?.("[data-drag-task-id]"),
        )
        .find((el): el is HTMLElement => isDestCard(el as HTMLElement | null));
      const card = isDestCard(cardFromTarget)
        ? cardFromTarget
        : (cardFromPoint ?? null);

      const hovered = dragOverTargetRef.current;
      const onTargetDay = hovered?.day === targetDay ? hovered : null;
      const targetIndex = card
        ? parseInt(card.dataset.dragOrder!, 10)
        : (onTargetDay?.orderIndex ??
          parseInt(group.dataset.dropNextOrder!, 10));
      // The drop lands above this row. Named rather than numbered because a
      // day's order indices repeat (see `planTaskDayMove`).
      const insertAboveTaskId = card
        ? (card.dataset.dragTaskId ?? null)
        : (onTargetDay?.taskId ?? null);

      handleDrop(targetDay, targetIndex, insertAboveTaskId);
    };

    el.addEventListener("dragstart", onDragStart);
    el.addEventListener("dragend", onDragEnd);
    el.addEventListener("dragover", onDragOver);
    el.addEventListener("dragleave", onDragLeave);
    el.addEventListener("drop", onDropHandler);

    return () => {
      el.removeEventListener("dragstart", onDragStart);
      el.removeEventListener("dragend", onDragEnd);
      el.removeEventListener("dragover", onDragOver);
      el.removeEventListener("dragleave", onDragLeave);
      el.removeEventListener("drop", onDropHandler);
    };
  }, [handleDrop]);

  const setDragAttrs = useCallback(
    (
      node: any,
      taskId: string,
      day: string,
      visualIndex: number,
      orderIndex: number,
    ) => {
      if (!isWeb || !node) return;
      const el = node as HTMLElement;
      el.draggable = true;
      el.dataset.dragTaskId = taskId;
      el.dataset.dragDay = day;
      el.dataset.dragIndex = String(visualIndex);
      el.dataset.dragOrder = String(orderIndex);
    },
    []
  );

  const setDropGroupAttrs = useCallback(
    (node: any, day: string, visualCount: number, nextOrder: number) => {
      if (!isWeb || !node) return;
      const el = node as HTMLElement;
      el.dataset.dropDay = day;
      el.dataset.dropCount = String(visualCount);
      el.dataset.dropNextOrder = String(nextOrder);
    },
    []
  );

  /**
   * Renders one task card. Shared between the web `.map()` path and the
   * native `NestableDraggableFlatList` path. On native, `onLongPressDrag` is
   * the drag-activation callback supplied by the draggable flatlist; binding
   * it to the row's `onLongPress` is what makes long-press start a drag.
   */
  const renderTaskCard = useCallback(
    (
      task: NonNullable<typeof tasks>[number],
      taskIndex: number,
      group: { day: string; tasks: typeof tasks },
      opts: {
        isValidDropDay: boolean;
        onLongPressDrag?: () => void;
        isActive?: boolean;
      },
    ) => {
      const { isValidDropDay, onLongPressDrag, isActive } = opts;
      const isTimerActive =
        timer.isRunning && timer.taskId === task._id;
      const timeSpent = task.timeSpentInSecondsUnallocated ?? 0;
      const isDragTarget =
        dragOverTarget?.day === group.day &&
        dragOverTarget?.index === taskIndex;
      const isCompleted = !!task.dateCompleted;
      const trackable = task.trackableId
        ? trackableMap.get(task.trackableId)
        : null;
      const list = task.listId ? listMap.get(task.listId) : null;
      const taskTags = (task.tagIds ?? [])
        .map((id: string) => tagMap.get(id))
        .filter(Boolean);

      const metaLabels: { colour?: string; name: string }[] = [];
      if (trackable) metaLabels.push(trackable);
      else if (list) metaLabels.push(list);
      for (const tag of taskTags) if (tag) metaLabels.push(tag as any);
      const hasTime = timeSpent > 0 || isTimerActive;

      // Flat row: no card. The colour dot carries identity; text stays grey.
      const cardContent = (
        <View
          style={[
            styles.taskCard,
            isTimerActive && styles.taskCardTicking,
            isCompleted && styles.taskCardCompleted,
          ]}
        >
          {/* Native gesture, outside the row long-press, so a check
              does not wait on the list pan or the 300ms drag timer. */}
          <GesturePressable
            onPress={() => {
              toggleComplete(task._id, task.name, isCompleted);
            }}
            hitSlop={8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isCompleted }}
            accessibilityLabel={
              isCompleted ? "Mark incomplete" : "Mark complete"
            }
            style={styles.checkBtn}
          >
            <Ionicons
              name={isCompleted ? "checkmark-circle" : "ellipse-outline"}
              size={22}
              color={isCompleted ? Colors.success : Colors.textTertiary}
            />
          </GesturePressable>
          <TouchableOpacity
            style={styles.taskMain}
            onPress={() => onSelectTask?.(task._id)}
            onLongPress={onLongPressDrag}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            <View style={styles.taskText}>
              <Text
                style={[styles.taskName, isCompleted && styles.completedTask]}
                numberOfLines={1}
              >
                {task.name}
              </Text>
              {metaLabels.length > 0 && (
                <View style={styles.tagsRow}>
                  {metaLabels.map((label, i) => (
                    <View key={i} style={styles.tagChip}>
                      <View
                        style={[
                          styles.tagDot,
                          { backgroundColor: label.colour || Colors.neutral },
                        ]}
                      />
                      <Text style={styles.tagName} numberOfLines={1}>
                        {label.name}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Timer + duration. The duration only appears once there is one. */}
            <View style={styles.timeCol}>
              {hasTime && (
                /* Tap-to-edit time spent (web parity: DurationPickerDesktop).
                   Read-only while the timer drives the value. */
                <TaskTimeSpentButton
                  taskId={task._id}
                  taskName={task.name}
                  seconds={timeSpent}
                  isTicking={isTimerActive}
                  timerStartTime={timer.startTime}
                  onEdit={openTimeSpentEditor}
                />
              )}
              {!isCompleted && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleToggleTimer(task._id);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityLabel={
                    isTimerActive ? "Pause timer" : "Start timer"
                  }
                >
                  <Ionicons
                    name={isTimerActive ? "pause" : "play-outline"}
                    size={18}
                    color={isTimerActive ? Colors.primary : Colors.textTertiary}
                  />
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </View>
      );

      return (
        <View
          key={task._id}
          ref={
            isWeb && isValidDropDay
              ? (node: any) =>
                  setDragAttrs(
                    node,
                    task._id,
                    group.day,
                    taskIndex,
                    task.taskDayOrderIndex ?? 0,
                  )
              : undefined
          }
          style={isActive ? styles.taskCardDragging : undefined}
        >
          {isDragTarget && <View style={styles.dropPlaceholder} />}
          {/* Wrap each row in a horizontal swipeable so users can swipe
           * LEFT to reveal a red "Delete" action (iOS Mail / Reminders /
           * Todoist / Google Tasks pattern). The recurring-instance vs
           * normal-task routing lives inside `useTaskDeleteMutation` so
           * this matches the desktop context-menu delete path.
           *
           * Disabled while the row is actively being dragged so the
           * `NestableDraggableFlatList` translation isn't fighting the
           * swipeable's horizontal panel. */}
          <SwipeableTaskRow
            enabled={!isActive}
            onDelete={() =>
              deleteTask({
                taskId: task._id,
                taskName: task.name,
                isRecurringInstance: task.isRecurringInstance,
                recurringTaskId: task.recurringTaskId,
              })
            }
          >
            {cardContent}
          </SwipeableTaskRow>
        </View>
      );
    },
    [
      timer,
      dragOverTarget,
      tagMap,
      listMap,
      trackableMap,
      onSelectTask,
      toggleComplete,
      handleToggleTimer,
      openTimeSpentEditor,
      setDragAttrs,
      deleteTask,
    ],
  );

  /**
   * Native cross-day drag-end handler.
   *
   * Given the post-drop `data` array, we:
   *   1. Locate the moved task at `to`. (Headers/placeholders can't be dragged
   *      because we don't wire `drag` for them in `renderItem`.)
   *   2. Walk backwards from `to - 1` to find the most recent `header` row —
   *      that's the destination day.
   *   3. Read the drop-target task's persisted `taskDayOrderIndex`
   *      (or max+1 when dropping onto an empty day).
   *   4. Compare the moved row's original `day` (set when we built `flatRows`)
   *      with the destination day. Same day -> `moveOnDay`; cross-day ->
   *      `moveBetweenDays`. Drops onto `overdue`/`unscheduled` are no-ops
   *      (re-render snaps the row back to its origin).
   */
  const handleNativeDragEnd = useCallback(
    (params: { data: FlatRow[]; from: number; to: number }) => {
      const { data, from, to } = params;
      if (from === to) return;
      const moved = data[to];
      if (!moved || moved.kind !== "task") return;

      const sourceDay = moved.day;
      let targetDay: string | null = null;
      for (let i = to - 1; i >= 0; i--) {
        const row = data[i];
        if (!row) continue;
        if (row.kind === "header") {
          targetDay = row.day;
          break;
        }
      }
      if (!targetDay) return;
      if (isPastDayGroup(targetDay, today) || targetDay === "unscheduled")
        return;

      const destTaskAt = (row: FlatRow | undefined) =>
        row?.kind === "task" &&
        row.day === targetDay &&
        row.task._id !== moved.task._id
          ? row
          : null;
      // After a downward cross-section drop, the hovered dest row sits at
      // `to + 1`. `to - 1` is often the Today header, which used to fall
      // through to max+1 and append.
      const landedOn = destTaskAt(data[to + 1]) ?? destTaskAt(data[to - 1]);
      const toIndex = toIndexAfterFlatMove({
        from,
        to,
        neighborOrder: landedOn?.task.taskDayOrderIndex,
        neighborInSameGroup: landedOn != null,
        fallbackOrders: data
          .filter(
            (row): row is Extract<FlatRow, { kind: "task" }> =>
              row.kind === "task" &&
              row.day === targetDay &&
              row.task._id !== moved.task._id,
          )
          .map((row) => row.task.taskDayOrderIndex),
      });

      // Row the moved task now sits above, read straight off the post-drop
      // array. Names the slot instead of numbering it, because a day's
      // order indices repeat (see `planTaskDayMove`).
      let insertAboveTaskId: Id<"tasks"> | null = null;
      for (let i = to + 1; i < data.length; i++) {
        const row = data[i];
        if (!row) continue;
        if (row.kind === "header") break;
        if (row.kind !== "task" || row.day !== targetDay) continue;
        if (row.task._id === moved.task._id) continue;
        insertAboveTaskId = row.task._id as Id<"tasks">;
        break;
      }

      const taskId = moved.task._id as Id<"tasks">;
      const fromDay =
        sourceDay === "unscheduled"
          ? (moved.task.taskDay ?? sourceDay)
          : sourceDay;
      if (fromDay === targetDay) {
        void moveOnDay({
          taskId,
          day: targetDay,
          insertAboveTaskId,
          toIndex,
        });
      } else {
        void moveBetweenDays({
          taskId,
          fromDay,
          toDay: targetDay,
          insertAboveTaskId,
          toIndex,
        });
      }
    },
    [moveOnDay, moveBetweenDays],
  );

  /**
   * `renderItem` for the native single-list path. Headers and empty-day
   * placeholders are NOT draggable (we omit `onLongPressDrag`); task rows
   * wire `drag` to enable long-press activation.
   */
  const renderFlatRow = useCallback(
    ({ item, drag, isActive }: RenderItemParams<FlatRow>) => {
      if (item.kind === "header") {
        return (
          <View style={styles.flatHeaderRow}>
            <TouchableOpacity
              style={styles.groupHeader}
              onPress={() => toggleGroupExpansion(item.day)}
              activeOpacity={0.7}
            >
              <Ionicons
                name="chevron-forward"
                size={16}
                color={Colors.textTertiary}
                style={[
                  styles.expandArrow,
                  !item.isCollapsed && styles.expandArrowOpen,
                ]}
              />
              <Text
                style={[
                  styles.groupLabel,
                  item.isOverdueDay && styles.overdueLabel,
                ]}
              >
                {item.label}
                <Text style={styles.taskCount}>
                  {" "}
                  {item.completedCount}/{item.totalCount}
                </Text>
              </Text>
              {!item.isPastDay && onAddTask && (
                <SectionHeadingAddButton
                  onPress={() =>
                    onAddTask(
                      item.day === "unscheduled" ? undefined : item.day,
                    )
                  }
                  accessibilityLabel={`Add task to ${item.label}`}
                />
              )}
            </TouchableOpacity>
            <View style={styles.divider} />
          </View>
        );
      }
      if (item.kind === "load-previous-overdue") {
        return (
          <TouchableOpacity
            style={styles.loadPreviousWeek}
            onPress={handleLoadPreviousOverdueWeek}
            accessibilityRole="button"
          >
            <Text style={styles.loadMoreText}>
              Load previous week ({item.hiddenCount} older)
            </Text>
          </TouchableOpacity>
        );
      }
      if (item.kind === "empty-placeholder") {
        return (
          <View style={styles.emptyDropZone}>
            <Text style={styles.emptyDropZoneText}>Drop a task here</Text>
          </View>
        );
      }
      return renderTaskCard(
        item.task,
        item.indexInDay,
        { day: item.day, tasks: [] as any },
        {
          isValidDropDay:
            !isPastDayGroup(item.day, today) && item.day !== "unscheduled",
          onLongPressDrag: drag,
          isActive,
        },
      );
    },
    [
      renderTaskCard,
      toggleGroupExpansion,
      onAddTask,
      handleLoadPreviousOverdueWeek,
    ],
  );

  if (!tasks) {
    return <SkeletonRows count={8} accessibilityLabel="Loading tasks" />;
  }

  /**
   * On native, the outer scroll surface must be `NestableScrollContainer` so
   * the per-group `NestableDraggableFlatList`s can auto-scroll the page while
   * dragging. On web, keep the plain `ScrollView` because the HTML5 drag API
   * + dnd-kit do their own auto-scrolling (and `react-native-draggable-flatlist`
   * is RN-only — its `Nestable*` components are no-ops/broken on web).
   */
  const OuterScroll = (isWeb ? ScrollView : NestableScrollContainer) as any;

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {isDesktop && onAddTask && (
            <SectionHeadingAddButton
              onPress={() => onAddTask(today)}
              accessibilityLabel="Add task"
            />
          )}
        </View>
      )}

      {/* "Show completed" is rarely changed, so it lives behind a quiet
          filter icon instead of a permanent bar above the list. */}
      <View style={styles.filterBar}>
        <TouchableOpacity
          onPress={() => setFilterMenuOpen(true)}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Task filters"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={showCompleted ? Colors.textTertiary : Colors.primary}
          />
        </TouchableOpacity>
      </View>
      <TaskFilterModal
        visible={filterMenuOpen}
        onClose={() => setFilterMenuOpen(false)}
        showCompleted={showCompleted}
        onPersistShowCompleted={setShowCompleted}
        filterUserIds={NO_FILTER_USERS}
        onToggleUserFilter={noopToggleUserFilter}
        assignableMembers={NO_FILTER_MEMBERS}
        showCollaboratorFilter={false}
      />

      {groupedTasks.length === 0 ? (
        <EmptyState
          title="No tasks"
          message={
            isDesktop
              ? "Click + to add your first task"
              : "Tap + to add your first task"
          }
        />
      ) : (
        <OuterScroll
          ref={scrollRef}
          contentContainerStyle={styles.listContent}
          refreshControl={
            !isDesktop ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  setTimeout(() => setRefreshing(false), 500);
                }}
                tintColor={Colors.primary}
              />
            ) : undefined
          }
        >
          {/**
           * NATIVE: render a single `NestableDraggableFlatList` over the
           * fully-flattened row list so a long-press drag can cross day
           * boundaries. Drop handling is in `handleNativeDragEnd`.
           */}
          {!isWeb && (
            <NestableDraggableFlatList
              data={flatRows}
              keyExtractor={(row: FlatRow) =>
                row.kind === "header"
                  ? `h:${row.day}`
                  : row.kind === "empty-placeholder"
                    ? `e:${row.day}`
                    : row.kind === "load-previous-overdue"
                      ? `lp:${row.day}`
                      : `t:${row.task._id}`
              }
              activationDistance={5}
              // Autoscroll the outer `NestableScrollContainer` when the
              // dragged cell hovers within `autoscrollThreshold` pixels of
              // the viewport edge.
              //
              // NOTE ON UNITS: our patched `useNestedAutoScroll` uses
              // `scrollTo({ animated: false })`, so `autoscrollSpeed` is
              // literally "pixels moved per frame at the very edge". At
              // ~60fps a value of 12 moves ~720px/sec (a comfortable page-
              // scroll rate on a ~800px-tall viewport). The lib's default
              // is 100 which was calibrated for `animated: true` (where
              // each scroll interpolated smoothly over ~250ms) — with our
              // patch 100 works out to ~6000px/sec, which is way too fast.
              autoscrollSpeed={12}
              autoscrollThreshold={80}
              onDragEnd={handleNativeDragEnd}
              renderItem={renderFlatRow}
            />
          )}
          {isWeb && olderOverdue.hiddenCount > 0 && (
            <TouchableOpacity
              style={styles.loadPreviousWeek}
              onPress={handleLoadPreviousOverdueWeek}
              accessibilityRole="button"
            >
              <Text style={styles.loadMoreText}>
                Load previous week ({olderOverdue.hiddenCount} older)
              </Text>
            </TouchableOpacity>
          )}
          {isWeb && groupedTasks.map((group) => {
            const isValidDropDay =
              !group.isPastDay && group.day !== "unscheduled";
            const isCollapsed = isGroupCollapsed(group.day, group.tasks.length);

            return (
              <View
                key={group.day}
                style={styles.group}
                ref={
                  isValidDropDay
                    ? (node: any) =>
                        setDropGroupAttrs(
                          node,
                          group.day,
                          group.tasks.length,
                          group.nextOrderIndex
                        )
                    : undefined
                }
              >
                {/* Group header — matches original: arrow + title + ratio + add */}
                <TouchableOpacity
                  style={styles.groupHeader}
                  onPress={() => toggleGroupExpansion(group.day)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={16}
                    color={Colors.textTertiary}
                    style={[
                      styles.expandArrow,
                      !isCollapsed && styles.expandArrowOpen,
                    ]}
                  />
                  <Text
                    style={[
                      styles.groupLabel,
                      group.isOverdueDay && styles.overdueLabel,
                    ]}
                  >
                    {group.label}
                    <Text style={styles.taskCount}>
                      {" "}
                      {group.completedCount}/{group.totalCount}
                    </Text>
                  </Text>
                  {!group.isPastDay && onAddTask && (
                    <SectionHeadingAddButton
                      onPress={() =>
                        onAddTask(
                          group.day === "unscheduled"
                            ? undefined
                            : group.day
                        )
                      }
                      accessibilityLabel={`Add task to ${group.label}`}
                    />
                  )}
                </TouchableOpacity>

                <View style={styles.divider} />

                {!isCollapsed && (
                  <>
                    {group.tasks.length === 0 && isValidDropDay && (
                      <View style={styles.emptyDropZone}>
                        <Text style={styles.emptyDropZoneText}>
                          {isWeb
                            ? "Drag & drop tasks here"
                            : "No tasks — long-press a task elsewhere to drag it here once cross-day reorder is supported"}
                        </Text>
                      </View>
                    )}

                    {/**
                     * Native long-press drag (within a single day) via
                     * `react-native-draggable-flatlist`. Cross-day moves stay
                     * web-only for now (no native drop-target detection).
                     * Web keeps its own HTML5 drag path (set up in the
                     * `useEffect` above) by falling through to the `.map`.
                     */}
                    {!isWeb && isValidDropDay && group.tasks.length > 0 ? (
                      <NestableDraggableFlatList
                        data={group.tasks}
                        keyExtractor={(t: any) => t._id}
                        activationDistance={5}
                        // Disable autoscroll: with multiple sibling
                        // draggable sub-lists inside one
                        // `NestableScrollContainer` the offset math drifts
                        // and the page would snap towards top.
                        // IMPORTANT: only set `autoscrollSpeed={0}` — do NOT
                        // also set `autoscrollThreshold={0}` because the
                        // library divides `distFromEdge / autoscrollThreshold`
                        // (NaN with threshold=0), then passes that NaN into
                        // `scrollTo({y})` which RN coerces to 0 → the page
                        // does still scroll to the top.
                        autoscrollSpeed={0}
                        onDragEnd={({ from, to }: { from: number; to: number }) => {
                          if (from === to) return;
                          const moved = group.tasks[from];
                          const dropTarget = group.tasks[to];
                          if (!moved) return;
                          // The row that ends up at `to` once the dragged one
                          // is lifted out, named rather than indexed because
                          // order indices repeat within a day.
                          const anchor = group.tasks.filter(
                            (t: any) => t._id !== moved._id,
                          )[to];
                          void moveOnDay({
                            taskId: moved._id as Id<"tasks">,
                            day: group.day,
                            insertAboveTaskId:
                              (anchor?._id as Id<"tasks">) ?? null,
                            toIndex: dropTarget?.taskDayOrderIndex ?? to,
                          });
                        }}
                        renderItem={({
                          item,
                          drag,
                          isActive,
                          getIndex,
                        }: RenderItemParams<NonNullable<typeof tasks>[number]>) =>
                          renderTaskCard(item, getIndex() ?? 0, group, {
                            isValidDropDay,
                            onLongPressDrag: drag,
                            isActive,
                          })
                        }
                      />
                    ) : (
                      group.tasks.map((task, taskIndex) =>
                        renderTaskCard(task, taskIndex, group, {
                          isValidDropDay,
                        }),
                      )
                    )}
                  </>
                )}
              </View>
            );
          })}

          <TouchableOpacity
            style={styles.loadMore}
            onPress={handleLoadMore}
          >
            <Text style={styles.loadMoreText}>Load More</Text>
          </TouchableOpacity>
        </OuterScroll>
      )}

      {!isDesktop && onAddTask && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => onAddTask(today)}
        >
          <Ionicons name="add" size={24} color={Colors.onPrimary} />
        </TouchableOpacity>
      )}

      {timeSpentDialog}
    </View>
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
  loadingText: { color: Colors.textSecondary, fontSize: FontSize.bodyLarge },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: FontSize.title, fontWeight: "700", color: Colors.text },
  filterBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  listContent: { padding: 16, paddingBottom: 80 },
  group: { marginBottom: 20 },
  // Top spacing for headers when rendered as rows inside the flat
  // `NestableDraggableFlatList` (native cross-day drag path). Mirrors the
  // `marginBottom: 20` that `group` used to add between sections.
  flatHeaderRow: { marginTop: 20 },

  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 4,
  },
  expandArrow: {
    transition: "transform 0.15s" as any,
  },
  expandArrowOpen: {
    transform: [{ rotate: "90deg" }],
  },
  groupLabel: {
    flex: 1,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  overdueLabel: { color: Colors.error },
  loadPreviousWeek: { alignItems: "center", paddingVertical: 8 },
  taskCount: {
    fontWeight: "400",
    color: Colors.textTertiary,
    fontSize: FontSize.body,
    marginLeft: 4,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginBottom: 6,
    marginTop: 2,
  },

  emptyDropZone: {
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    borderStyle: "dashed",
    borderRadius: Radius.md,
    padding: 12,
    alignItems: "center",
    marginBottom: 6,
  },
  emptyDropZoneText: {
    fontSize: FontSize.body,
    fontStyle: "italic",
    color: Colors.textTertiary,
  },

  // Flat row. The background is opaque (same as the page) so the swipe
  // "Delete" action stays hidden underneath until the row is dragged.
  taskCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  taskCardTicking: {
    backgroundColor: Colors.accentWash,
    borderRadius: Radius.md,
    borderBottomColor: Colors.transparent,
  },
  taskCardCompleted: { opacity: 0.5 },
  /** Visual cue while the native long-press drag is active. */
  taskCardDragging: {
    opacity: 0.85,
    transform: [{ scale: 1.02 }],
  },

  checkBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: -6,
    marginLeft: -8,
  },
  taskMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minWidth: 0,
  },
  taskText: { flex: 1, minWidth: 0, gap: 2 },
  taskName: {
    fontSize: FontSize.bodyLarge,
    color: Colors.text,
    fontWeight: "400",
  },
  completedTask: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },

  timeCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  duration: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"] as any,
    minWidth: 42,
    textAlign: "right",
  },
  durationActive: {
    color: Colors.primary,
    fontWeight: "600",
  },

  tagsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  tagDot: { width: 6, height: 6, borderRadius: Radius.pill },
  tagName: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    maxWidth: 140,
  },

  dropPlaceholder: {
    height: 52,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: Radius.md,
    marginBottom: 6,
    ...Platform.select({
      web: {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)",
      } as any,
      default: {
        backgroundColor: "rgba(255,255,255,0.05)",
      },
    }),
  },

  loadMore: {
    alignItems: "center",
    paddingVertical: 16,
  },
  loadMoreText: {
    color: Colors.textSecondary,
    fontSize: FontSize.caption,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
      },
    }),
  },
});
