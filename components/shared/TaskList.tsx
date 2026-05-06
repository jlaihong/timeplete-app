import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Platform,
  Switch,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDate,
  isToday,
  isPast,
  formatSecondsAsHM,
} from "../../lib/dates";
import { useTimer } from "../../hooks/useTimer";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { Id } from "../../convex/_generated/dataModel";

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
  const [visibleDays, setVisibleDays] = useState(7);
  const visibleEndDay = addDays(today, visibleDays - 1);

  const tasks = useQuery(
    api.tasks.search,
    profileReady ? { includeCompleted: true } : "skip",
  );
  const tags = useQuery(api.tags.search, profileReady ? {} : "skip");
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const trackables = useQuery(api.trackables.search, profileReady ? {} : "skip");
  const upsertTask = useMutation(api.tasks.upsert);
  const moveOnDay = useMutation(api.tasks.moveOnDay);
  const moveBetweenDays = useMutation(api.tasks.moveBetweenDays);
  const timer = useTimer();

  const [showCompleted, setShowCompleted] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set()
  );
  const [dragOverTarget, setDragOverTarget] = useState<{
    day: string;
    index: number;
  } | null>(null);

  const dragDataRef = useRef<{
    taskId: string;
    sourceDay: string;
    sourceIndex: number;
  } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

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

  const { groupedTasks, hasMoreFuture } = useMemo(() => {
    if (!tasks) return { groupedTasks: [], hasMoreFuture: false };
    const groups = new Map<string, typeof tasks>();
    const overdueKey = "overdue";
    let futureTasksBeyondRange = false;

    for (const task of tasks) {
      const day = task.taskDay;
      if (!day) {
        const key = "unscheduled";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(task);
        continue;
      }

      if (day > visibleEndDay && !task.dateCompleted) {
        futureTasksBeyondRange = true;
        continue;
      }

      if (
        !task.dateCompleted &&
        isPast(day) &&
        !isToday(day) &&
        !task.isRecurringInstance
      ) {
        if (!groups.has(overdueKey)) groups.set(overdueKey, []);
        groups.get(overdueKey)!.push(task);
      } else if (task.dateCompleted) {
        const completionDay = task.dateCompleted;
        if (completionDay >= today && completionDay <= visibleEndDay) {
          if (!groups.has(completionDay)) groups.set(completionDay, []);
          groups.get(completionDay)!.push(task);
        }
      } else {
        if (!groups.has(day)) groups.set(day, []);
        groups.get(day)!.push(task);
      }
    }

    const entries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "overdue") return -1;
      if (b === "overdue") return 1;
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });

    return {
      groupedTasks: entries.map(([day, dayTasks]) => {
        const allTasks = dayTasks.sort((a, b) => {
          if (!a.dateCompleted && b.dateCompleted) return -1;
          if (a.dateCompleted && !b.dateCompleted) return 1;
          return (a.taskDayOrderIndex ?? 0) - (b.taskDayOrderIndex ?? 0);
        });
        const completedCount = allTasks.filter(
          (t) => !!t.dateCompleted
        ).length;
        const visibleTasks = showCompleted
          ? allTasks
          : allTasks.filter((t) => !t.dateCompleted);

        return {
          day,
          label:
            day === "overdue"
              ? "Overdue"
              : day === "unscheduled"
                ? "Unscheduled"
                : isToday(day)
                  ? "Today"
                  : formatDisplayDate(day),
          tasks: visibleTasks,
          completedCount,
          totalCount: allTasks.length,
        };
      }),
      hasMoreFuture: futureTasksBeyondRange,
    };
  }, [tasks, showCompleted, visibleEndDay, today]);

  const toggleComplete = useCallback(
    async (taskId: Id<"tasks">, taskName: string, isCompleted: boolean) => {
      if (!isCompleted && timer.isRunning && timer.taskId === taskId) {
        timer.stop();
      }
      await upsertTask({
        id: taskId,
        name: taskName,
        dateCompleted: isCompleted ? undefined : todayYYYYMMDD(),
      });
    },
    [upsertTask, timer]
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

  const handleLoadMore = useCallback(() => {
    setVisibleDays((d) => d + LOAD_MORE_DAYS);
  }, []);

  const toggleGroupExpansion = useCallback((day: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }, []);

  const handleDrop = useCallback(
    async (targetDay: string, targetIndex: number) => {
      const drag = dragDataRef.current;
      if (!drag) return;
      dragDataRef.current = null;
      setDragOverTarget(null);

      const taskId = drag.taskId as Id<"tasks">;
      if (drag.sourceDay === targetDay) {
        if (drag.sourceIndex !== targetIndex) {
          await moveOnDay({
            taskId,
            day: targetDay,
            newOrderIndex: targetIndex,
          });
        }
      } else {
        await moveBetweenDays({
          taskId,
          fromDay: drag.sourceDay,
          toDay: targetDay,
          newOrderIndex: targetIndex,
        });
      }
    },
    [moveOnDay, moveBetweenDays]
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
        sourceIndex: parseInt(card.dataset.dragIndex!, 10),
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

      if (card) {
        setDragOverTarget({
          day: card.dataset.dragDay!,
          index: parseInt(card.dataset.dragIndex!, 10),
        });
      } else {
        setDragOverTarget({
          day: group.dataset.dropDay!,
          index: parseInt(group.dataset.dropCount!, 10),
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
      const card = (e.target as HTMLElement).closest?.(
        "[data-drag-task-id]"
      ) as HTMLElement | null;
      const group = (e.target as HTMLElement).closest?.(
        "[data-drop-day]"
      ) as HTMLElement | null;
      if (!group) return;

      const targetDay = group.dataset.dropDay!;
      const targetIndex = card
        ? parseInt(card.dataset.dragIndex!, 10)
        : parseInt(group.dataset.dropCount!, 10);

      handleDrop(targetDay, targetIndex);
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

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const setDragAttrs = useCallback(
    (node: any, taskId: string, day: string, index: number) => {
      if (!isWeb || !node) return;
      const el = node as HTMLElement;
      el.draggable = true;
      el.dataset.dragTaskId = taskId;
      el.dataset.dragDay = day;
      el.dataset.dragIndex = String(index);
    },
    []
  );

  const setDropGroupAttrs = useCallback(
    (node: any, day: string, taskCount: number) => {
      if (!isWeb || !node) return;
      const el = node as HTMLElement;
      el.dataset.dropDay = day;
      el.dataset.dropCount = String(taskCount);
    },
    []
  );

  if (!tasks) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {isDesktop && onAddTask && (
            <TouchableOpacity onPress={() => onAddTask(today)}>
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
            </TouchableOpacity>
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
            thumbColor={showCompleted ? Colors.primary : Colors.textTertiary}
          />
        </View>
      </View>

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
        <ScrollView
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
          {groupedTasks.map((group) => {
            const isValidDropDay =
              group.day !== "overdue" && group.day !== "unscheduled";
            const isCollapsed = collapsedGroups.has(group.day);

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
                          group.tasks.length
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
                      group.day === "overdue" && styles.overdueLabel,
                    ]}
                  >
                    {group.label}
                    <Text style={styles.taskCount}>
                      {" "}
                      {group.completedCount}/{group.totalCount}
                    </Text>
                  </Text>
                  {group.day !== "overdue" && onAddTask && (
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        onAddTask(
                          group.day === "unscheduled"
                            ? undefined
                            : group.day
                        );
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.addButton}
                    >
                      <Ionicons name="add" size={20} color={Colors.text} />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                <View style={styles.divider} />

                {!isCollapsed && (
                  <>
                    {group.tasks.length === 0 && isValidDropDay && (
                      <View style={styles.emptyDropZone}>
                        <Text style={styles.emptyDropZoneText}>
                          Drag & drop tasks here
                        </Text>
                      </View>
                    )}

                    {group.tasks.map((task, taskIndex) => {
                      const isTimerActive =
                        timer.isRunning && timer.taskId === task._id;
                      const timeSpent =
                        task.timeSpentInSecondsUnallocated ?? 0;
                      const totalTime = isTimerActive
                        ? timeSpent + timer.elapsed
                        : timeSpent;
                      const isDragTarget =
                        dragOverTarget?.day === group.day &&
                        dragOverTarget?.index === taskIndex;
                      const isCompleted = !!task.dateCompleted;
                      const trackable = task.trackableId
                        ? trackableMap.get(task.trackableId)
                        : null;
                      const list = task.listId
                        ? listMap.get(task.listId)
                        : null;
                      const taskTags = (task.tagIds ?? [])
                        .map((id: string) => tagMap.get(id))
                        .filter(Boolean);

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
                                    taskIndex
                                  )
                              : undefined
                          }
                        >
                          {isDragTarget && (
                            <View style={styles.dropPlaceholder} />
                          )}
                          <Card
                            style={[
                              styles.taskCard,
                              isTimerActive && styles.taskCardTicking,
                              isCompleted && styles.taskCardCompleted,
                            ]}
                            padded={false}
                          >
                            <TouchableOpacity
                              style={styles.taskRow}
                              onPress={() => onSelectTask?.(task._id)}
                              activeOpacity={0.7}
                            >
                              {/* Col 1: Complete toggle */}
                              <TouchableOpacity
                                onPress={(e) => {
                                  e.stopPropagation?.();
                                  toggleComplete(
                                    task._id,
                                    task.name,
                                    isCompleted
                                  );
                                }}
                                hitSlop={{
                                  top: 8,
                                  bottom: 8,
                                  left: 8,
                                  right: 8,
                                }}
                              >
                                <Ionicons
                                  name={
                                    isCompleted
                                      ? "checkmark-circle"
                                      : "ellipse-outline"
                                  }
                                  size={24}
                                  color={
                                    isCompleted
                                      ? Colors.success
                                      : Colors.textTertiary
                                  }
                                />
                              </TouchableOpacity>

                              {/* Col 2: Name */}
                              <Text
                                style={[
                                  styles.taskName,
                                  isCompleted && styles.completedTask,
                                ]}
                                numberOfLines={1}
                              >
                                {task.name}
                              </Text>

                              {/* Col 3: Timer + Duration */}
                              <View style={styles.timeCol}>
                                {!isCompleted && (
                                  <TouchableOpacity
                                    onPress={(e) => {
                                      e.stopPropagation?.();
                                      handleToggleTimer(task._id);
                                    }}
                                    hitSlop={{
                                      top: 6,
                                      bottom: 6,
                                      left: 6,
                                      right: 6,
                                    }}
                                  >
                                    <Ionicons
                                      name={
                                        isTimerActive
                                          ? "pause"
                                          : "play-outline"
                                      }
                                      size={20}
                                      color={
                                        isTimerActive
                                          ? Colors.success
                                          : Colors.textSecondary
                                      }
                                    />
                                  </TouchableOpacity>
                                )}
                                <Text
                                  style={[
                                    styles.duration,
                                    isTimerActive && styles.durationActive,
                                  ]}
                                >
                                  {isTimerActive
                                    ? formatElapsed(totalTime)
                                    : formatSecondsAsHM(totalTime)}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            {/* Tags row — below the main grid */}
                            {(trackable || list || taskTags.length > 0) && (
                              <View style={styles.tagsRow}>
                                {trackable && (
                                  <View style={styles.tagChip}>
                                    <Ionicons
                                      name="analytics"
                                      size={13}
                                      color={trackable.colour || Colors.text}
                                    />
                                    <Text
                                      style={[
                                        styles.tagName,
                                        {
                                          color:
                                            trackable.colour || Colors.text,
                                        },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {trackable.name}
                                    </Text>
                                  </View>
                                )}
                                {!trackable && list && (
                                  <View style={styles.tagChip}>
                                    <Ionicons
                                      name="list"
                                      size={13}
                                      color={list.colour || Colors.text}
                                    />
                                    <Text
                                      style={[
                                        styles.tagName,
                                        {
                                          color: list.colour || Colors.text,
                                        },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {list.name}
                                    </Text>
                                  </View>
                                )}
                                {taskTags.map((tag: any, i: number) => (
                                  <View key={i} style={styles.tagChip}>
                                    <Ionicons
                                      name="pricetag"
                                      size={12}
                                      color={tag.colour || Colors.text}
                                    />
                                    <Text
                                      style={[
                                        styles.tagName,
                                        { color: tag.colour || Colors.text },
                                      ]}
                                      numberOfLines={1}
                                    >
                                      {tag.name}
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            )}
                          </Card>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            );
          })}

          {hasMoreFuture && (
            <TouchableOpacity
              style={styles.loadMore}
              onPress={handleLoadMore}
            >
              <Text style={styles.loadMoreText}>Load More</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {!isDesktop && onAddTask && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => onAddTask(today)}
        >
          <Ionicons name="add" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
      )}
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
  },
  expandArrow: {
    transition: "transform 0.15s" as any,
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
    marginLeft: 4,
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
    marginBottom: 6,
    marginTop: 2,
  },

  emptyDropZone: {
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
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

  taskCard: { marginBottom: 6 },
  taskCardTicking: {
    borderColor: Colors.success,
    borderWidth: 2,
  },
  taskCardCompleted: { opacity: 0.5 },

  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 8,
  },
  taskName: {
    flex: 1,
    fontSize: 15,
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
    gap: 6,
  },
  duration: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontVariant: ["tabular-nums"] as any,
    minWidth: 42,
    textAlign: "right",
  },
  durationActive: {
    color: Colors.success,
    fontWeight: "600",
  },

  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    paddingTop: 0,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  tagName: {
    fontSize: 12,
    maxWidth: 100,
  },

  dropPlaceholder: {
    height: 80,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    borderRadius: 8,
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
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "500",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
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
