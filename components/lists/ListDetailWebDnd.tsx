/**
 * Web-only drag-and-drop list sections (productivity-one `task-group` + CDK).
 * Self-contained `DndContext` — unlike the home page, the list has no calendar.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
} from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  closestCenter,
  useDndMonitor,
  useDroppable,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
  TaskDragPlaceholder,
} from "../tasks/TaskRowDesktop";
import type { Id } from "../../convex/_generated/dataModel";

const isWeb = Platform.OS === "web";

export type ListDetailDndSection = {
  sectionId: Id<"listSections">;
  title: string;
  isDefault: boolean;
  /** Completed / total for the section header (not tied to the “show completed” row filter). */
  headerCompletedCount: number;
  headerTotalCount: number;
  tasks: TaskRowTask[];
};

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

interface SortableRowProps {
  task: TaskRowTask;
  meta: TaskRowMeta;
  groupId: string;
  isTicking: boolean;
  timerElapsed: number;
  canDrag: boolean;
  displayColor: string;
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
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useSortable({
    id: task._id,
    data: { type: "task", groupId, task, meta, displayColor, durationSec },
    disabled: !canDrag,
    animateLayoutChanges: () => false,
  });

  const style: Record<string, string | number | undefined> = {
    transform: CSS.Transform.toString(transform),
    width: "100%",
  };

  const dragHandleProps = canDrag
    ? ({ ...attributes, ...listeners } as Record<string, unknown>)
    : undefined;

  return (
    <div ref={setNodeRef as React.Ref<HTMLDivElement>} style={style}>
      {isDragging ? (
        <TaskDragPlaceholder />
      ) : (
        <TaskRowDesktop
          task={task}
          meta={meta}
          isTicking={isTicking}
          timerElapsedSeconds={timerElapsed}
          showDate
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
        ...(isEmpty && !disabled
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
          <Text style={styles.emptyDropZoneText}>Drag tasks here</Text>
        </View>
      ) : null}
      {children}
    </div>
  );
}

type LocalGroup = {
  id: string;
  sectionId: Id<"listSections">;
  title: string;
  isDefault: boolean;
  headerCompletedCount: number;
  headerTotalCount: number;
  tasks: TaskRowTask[];
};

export interface ListDetailWebDndProps {
  sections: ListDetailDndSection[];
  buildMeta: (task: TaskRowTask) => TaskRowMeta;
  canDrag: boolean;
  isTicking: (taskId: Id<"tasks">) => boolean;
  timerElapsed: number;
  onSelectTask?: (id: Id<"tasks">) => void;
  onToggleComplete?: (id: Id<"tasks">) => void;
  onToggleTimer?: (id: Id<"tasks">) => void;
  onSetTimeSpent?: (id: Id<"tasks">, s: number) => void;
  onRequestContextMenu?: (id: Id<"tasks">, x: number, y: number) => void;
  moveBetweenSections: (args: {
    taskId: Id<"tasks">;
    toSectionId: Id<"listSections">;
    newOrderIndex: number;
  }) => Promise<void>;
  /** Opens add-task UI for a specific section (productivity-one per-section +). */
  onAddTaskToSection?: (sectionId: Id<"listSections">) => void;
  listContentStyle?: object;
  /** Footer inside scroll (load more, etc.) */
  footer?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
}

const DEFAULT_DURATION_SEC = 1800;

function sectionHeaderCountSuffix(
  completed: number,
  total: number,
): string {
  if (total === 0) return "";
  return ` ${completed}/${total}`;
}

function groupsFromDetailSections(
  detailSections: ListDetailDndSection[],
): LocalGroup[] {
  return detailSections.map((s) => ({
    id: String(s.sectionId),
    sectionId: s.sectionId,
    title: s.title,
    isDefault: s.isDefault,
    headerCompletedCount: s.headerCompletedCount,
    headerTotalCount: s.headerTotalCount,
    tasks: s.tasks.map((t) => ({ ...t })),
  }));
}

function cloneLocalGroups(gs: LocalGroup[]): LocalGroup[] {
  return gs.map((g) => ({
    ...g,
    tasks: g.tasks.map((t) => ({ ...t })),
  }));
}

function findTaskLocationIn(
  groups: LocalGroup[],
  taskId: string,
): { groupId: string; index: number } | null {
  for (const g of groups) {
    const idx = g.tasks.findIndex((t) => t._id === taskId);
    if (idx !== -1) return { groupId: g.id, index: idx };
  }
  return null;
}

/** Section id + task id order only — must match `groupsFromDetailSections` mapping. */
function fingerprintTaskOrder(groups: LocalGroup[]): string {
  return groups
    .map((g) => `${g.id}:${g.tasks.map((t) => t._id).join(",")}`)
    .join("|");
}

export function ListDetailWebDnd({
  sections,
  buildMeta,
  canDrag,
  isTicking,
  timerElapsed,
  onSelectTask,
  onToggleComplete,
  onToggleTimer,
  onSetTimeSpent,
  onRequestContextMenu,
  moveBetweenSections,
  onAddTaskToSection,
  listContentStyle,
  footer,
  ListEmptyComponent,
}: ListDetailWebDndProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
  const isDraggingRef = useRef(false);
  /** Block `sections` resync until Convex matches this order (mutation returns before query does). */
  const pendingReorderFingerprintRef = useRef<string | null>(null);
  const pendingReorderDeadlineMsRef = useRef(0);

  useEffect(() => {
    // Mirror `DesktopTaskList`: resync from server whenever `sections` changes.
    // A key that only tracked task ids missed field edits (e.g. `taskDay` from
    // TaskDetailSheet), so the list showed stale dates until full remount/refresh.
    // While dragging (or awaiting `moveBetweenSections` in `onDragEnd`), skip sync so
    // Convex cannot briefly overwrite optimistic order with a pre-mutation snapshot.
    if (isDraggingRef.current) return;

    const incoming = groupsFromDetailSections(sections);
    const incomingFp = fingerprintTaskOrder(incoming);
    const pending = pendingReorderFingerprintRef.current;
    const deadline = pendingReorderDeadlineMsRef.current;
    const now = Date.now();
    const deadlineExpired = pending !== null && deadline > 0 && now > deadline;

    if (pending !== null && !deadlineExpired && incomingFp !== pending) {
      return;
    }
    if (pending !== null) {
      pendingReorderFingerprintRef.current = null;
      pendingReorderDeadlineMsRef.current = 0;
    }

    setLocalGroups(incoming);
  }, [sections]);

  const serverGroups = useMemo(
    () => groupsFromDetailSections(sections),
    [sections],
  );

  const findTaskLocation = useCallback(
    (taskId: string): { groupId: string; index: number } | null =>
      findTaskLocationIn(localGroups, taskId),
    [localGroups],
  );

  const deriveDisplayColor = useCallback(
    (task: TaskRowTask, meta: TaskRowMeta) => {
      if (task.trackableId && meta.trackable?.colour) return meta.trackable.colour;
      if (task.listId && meta.list?.colour) return meta.list.colour;
      return "#6b7280";
    },
    [],
  );

  const deriveDurationSec = useCallback((task: TaskRowTask): number => {
    const est = (
      task as unknown as { timeEstimatedInSecondsUnallocated?: number }
    ).timeEstimatedInSecondsUnallocated;
    if (typeof est === "number" && est > 60) return est;
    return DEFAULT_DURATION_SEC;
  }, []);

  const [activeDrag, setActiveDrag] = useState<{
    task: TaskRowTask;
    meta: TaskRowMeta;
    fromGroupId: string;
    fromIndex: number;
  } | null>(null);

  const [collapsedSectionIds, setCollapsedSectionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const toggleSectionCollapsed = useCallback((sectionKey: string) => {
    setCollapsedSectionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  const onDragStart = useCallback(
    (event: DragStartEvent) => {
      const taskId = String(event.active.id);
      const loc = findTaskLocation(taskId);
      if (!loc) return;
      const g = localGroups.find((x) => x.id === loc.groupId);
      if (!g) return;
      const task = g.tasks[loc.index];
      const meta = buildMeta(task);
      isDraggingRef.current = true;
      setActiveDrag({
        task,
        meta,
        fromGroupId: loc.groupId,
        fromIndex: loc.index,
      });
    },
    [findTaskLocation, localGroups, buildMeta],
  );

  const onDragOver = useCallback((event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    setLocalGroups((prev) => {
      const activeLoc = findTaskLocationIn(prev, activeId);
      if (!activeLoc) return prev;

      let targetGroupId: string;
      let targetIndex: number;

      const overData = over.data.current as
        | { type?: string; groupId?: string }
        | undefined;

      if (overData?.type === "group" && overData.groupId) {
        targetGroupId = overData.groupId;
        const targetGroup = prev.find((g) => g.id === targetGroupId);
        targetIndex = targetGroup ? targetGroup.tasks.length : 0;
      } else {
        const overLoc = findTaskLocationIn(prev, overId);
        if (!overLoc) return prev;
        targetGroupId = overLoc.groupId;
        targetIndex = overLoc.index;
      }

      if (activeLoc.groupId === targetGroupId) return prev;

      const fromG = prev.find((g) => g.id === activeLoc.groupId);
      const toG = prev.find((g) => g.id === targetGroupId);
      if (!fromG || !toG) return prev;

      const movedTask = fromG.tasks[activeLoc.index];
      if (!movedTask || movedTask._id !== activeId) return prev;

      const insertAt = Math.min(targetIndex, toG.tasks.length);

      return prev.map((g) => {
        if (g.id === activeLoc.groupId) {
          return {
            ...g,
            tasks: fromG.tasks.filter((_, i) => i !== activeLoc.index),
          };
        }
        if (g.id === targetGroupId) {
          const tasks = [...toG.tasks];
          tasks.splice(insertAt, 0, movedTask);
          return { ...g, tasks };
        }
        return g;
      });
    });
  }, []);

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const startInfo = activeDrag;
      setActiveDrag(null);
      if (!startInfo) {
        isDraggingRef.current = false;
        return;
      }

      /** Keep true until mutation + local fixes finish so `sections` useEffect cannot
       * clobber optimistic `onDragOver` state with a stale Convex snapshot. */
      try {
        const { active, over } = event;
        const taskId = String(active.id) as Id<"tasks">;

        const currentLoc = findTaskLocation(taskId);
        if (!currentLoc) return;

        let toSectionKey = currentLoc.groupId;
        let newOrderIndex = currentLoc.index;

        if (over) {
          const overId = String(over.id);
          const overData = over.data.current as
            | { type?: string; groupId?: string }
            | undefined;

          if (overData?.type === "group" && overData.groupId) {
            toSectionKey = overData.groupId;
            const groupLen =
              localGroups.find((g) => g.id === toSectionKey)?.tasks.length ?? 0;
            if (toSectionKey === currentLoc.groupId) {
              newOrderIndex = Math.max(0, groupLen - 1);
            } else {
              newOrderIndex = groupLen;
            }
          } else if (overId !== taskId) {
            const overLoc = findTaskLocation(overId);
            if (overLoc && overLoc.groupId === currentLoc.groupId) {
              toSectionKey = overLoc.groupId;
              newOrderIndex = overLoc.index;
            }
          }
        }

        const fromGroupId = startInfo.fromGroupId;

        if (
          fromGroupId === toSectionKey &&
          startInfo.fromIndex === newOrderIndex
        ) {
          return;
        }

        let modeledGroups = cloneLocalGroups(localGroups);
        if (
          toSectionKey === currentLoc.groupId &&
          currentLoc.index !== newOrderIndex
        ) {
          modeledGroups = modeledGroups.map((g) =>
            g.id !== toSectionKey
              ? g
              : {
                  ...g,
                  tasks: arrayMove(
                    [...g.tasks],
                    currentLoc.index,
                    newOrderIndex,
                  ),
                },
          );
          setLocalGroups(modeledGroups);
        }

        pendingReorderFingerprintRef.current =
          fingerprintTaskOrder(modeledGroups);
        pendingReorderDeadlineMsRef.current = Date.now() + 8000;

        const toSectionId = toSectionKey as Id<"listSections">;

        try {
          await moveBetweenSections({
            taskId,
            toSectionId,
            newOrderIndex,
          });
        } catch (err) {
          pendingReorderFingerprintRef.current = null;
          pendingReorderDeadlineMsRef.current = 0;
          setLocalGroups(serverGroups);
          // eslint-disable-next-line no-console
          console.error("List section move failed", err);
        }
      } finally {
        isDraggingRef.current = false;
      }
    },
    [
      activeDrag,
      findTaskLocation,
      localGroups,
      moveBetweenSections,
      serverGroups,
    ],
  );

  const onDragCancel = useCallback(() => {
    setActiveDrag(null);
    isDraggingRef.current = false;
    pendingReorderFingerprintRef.current = null;
    pendingReorderDeadlineMsRef.current = 0;
    setLocalGroups(serverGroups);
  }, [serverGroups]);

  const noSections = localGroups.length === 0;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <TaskListDndMonitor
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      />
      <ScrollView
        style={[styles.scroll, isWeb && styles.scrollColumnBounded]}
        contentContainerStyle={[styles.listContent, listContentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {noSections
          ? ListEmptyComponent
          : localGroups.map((group) => {
              const isCollapsed = collapsedSectionIds.has(group.id);
              const countSuffix = sectionHeaderCountSuffix(
                group.headerCompletedCount,
                group.headerTotalCount,
              );
              return (
                <View key={group.id} style={styles.sectionBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <Pressable
                      style={styles.sectionHeaderMain}
                      onPress={() => toggleSectionCollapsed(group.id)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: !isCollapsed }}
                      accessibilityLabel={`${group.title}, ${isCollapsed ? "collapsed" : "expanded"}`}
                    >
                      <MaterialIcons
                        name="arrow-forward-ios"
                        size={18}
                        color={Colors.textTertiary}
                        style={[
                          styles.expandArrow,
                          !isCollapsed && styles.expandArrowOpen,
                        ]}
                      />
                      <Text style={styles.sectionTitle} numberOfLines={1}>
                        {group.title}
                        <Text style={styles.sectionCountInline}>
                          {countSuffix}
                        </Text>
                      </Text>
                    </Pressable>
                    {onAddTaskToSection ? (
                      <Pressable
                        onPress={(e: { stopPropagation?: () => void }) => {
                          e?.stopPropagation?.();
                          onAddTaskToSection(group.sectionId);
                        }}
                        style={({ hovered }: { hovered?: boolean }) => [
                          styles.sectionAddBtn,
                          hovered && styles.sectionAddBtnHover,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Add task to ${group.title}`}
                        hitSlop={8}
                      >
                        <Ionicons
                          name="add"
                          size={24}
                          color={Colors.primary}
                        />
                      </Pressable>
                    ) : null}
                  </View>
                  <View style={styles.sectionDivider} />
                  {!isCollapsed ? (
                    <SortableContext
                      id={`section:${group.id}`}
                      items={group.tasks.map((t) => t._id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <DroppableGroupBody
                        groupId={group.id}
                        disabled={!canDrag}
                        isEmpty={group.tasks.length === 0}
                      >
                        {group.tasks.map((task) => {
                          const meta = buildMeta(task);
                          const tick = isTicking(task._id);
                          return (
                            <View key={task._id} style={styles.rowWrap}>
                              <SortableRow
                                task={task}
                                meta={meta}
                                groupId={group.id}
                                isTicking={tick}
                                timerElapsed={timerElapsed}
                                canDrag={canDrag}
                                displayColor={deriveDisplayColor(task, meta)}
                                durationSec={deriveDurationSec(task)}
                                onSelect={onSelectTask}
                                onToggleComplete={onToggleComplete}
                                onToggleTimer={onToggleTimer}
                                onSetTimeSpent={onSetTimeSpent}
                                onRequestContextMenu={onRequestContextMenu}
                              />
                            </View>
                          );
                        })}
                      </DroppableGroupBody>
                    </SortableContext>
                  ) : null}
                </View>
              );
            })}
        {footer}
      </ScrollView>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <View style={{ width: "100%", maxWidth: 672, opacity: 0.95 }}>
            <TaskRowDesktop
              task={activeDrag.task}
              meta={activeDrag.meta}
              isTicking={isTicking(activeDrag.task._id)}
              timerElapsedSeconds={timerElapsed}
              showDate
              isOverlay
            />
          </View>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 0 },
  scrollColumnBounded: {
    width: "100%",
    maxWidth: 672,
    alignSelf: "center",
  },
  listContent: { padding: 16, paddingBottom: 24 },
  sectionBlock: { marginBottom: 4 },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 4,
  },
  sectionHeaderMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  sectionAddBtn: {
    padding: 6,
    borderRadius: 20,
    ...Platform.select({
      web: { cursor: "pointer" } as object,
      default: {},
    }),
  },
  sectionAddBtnHover: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.outlineVariant,
    marginBottom: 10,
    marginTop: 2,
  },
  expandArrow: {
    marginRight: 0,
    ...Platform.select({
      web: { transition: "transform 150ms ease" } as object,
      default: {},
    }),
  },
  expandArrowOpen: {
    transform: [{ rotate: "90deg" }],
  },
  sectionTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "500",
    color: Colors.text,
    minWidth: 0,
  },
  sectionCountInline: {
    fontSize: 15,
    fontWeight: "400",
    color: Colors.textTertiary,
  },
  rowWrap: { marginBottom: 8 },
  emptyDropZone: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyDropZoneText: { fontSize: 13, color: Colors.textTertiary },
});
