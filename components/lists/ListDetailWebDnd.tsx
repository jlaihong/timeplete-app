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
import { View, Text, StyleSheet, ScrollView } from "react-native";
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
import { Colors } from "../../constants/colors";
import {
  TaskRowDesktop,
  TaskRowTask,
  TaskRowMeta,
  TaskDragPlaceholder,
} from "../tasks/TaskRowDesktop";
import type { Id } from "../../convex/_generated/dataModel";

export type ListDetailDndSection = {
  sectionId: Id<"listSections">;
  title: string;
  isDefault: boolean;
  totalTasks: number;
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
    transition,
    isDragging,
  } = useSortable({
    id: task._id,
    data: { type: "task", groupId, task, meta, displayColor, durationSec },
    disabled: !canDrag,
  });

  const style: Record<string, string | number | undefined> = {
    transform: CSS.Transform.toString(transform),
    transition: transition as string | undefined,
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
  totalTasks: number;
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
  listContentStyle?: object;
  /** Footer inside scroll (load more, etc.) */
  footer?: React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
}

const DEFAULT_DURATION_SEC = 1800;

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
  listContentStyle,
  footer,
  ListEmptyComponent,
}: ListDetailWebDndProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const [localGroups, setLocalGroups] = useState<LocalGroup[]>([]);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    // Mirror `DesktopTaskList`: resync from server whenever `sections` changes.
    // A key that only tracked task ids missed field edits (e.g. `taskDay` from
    // TaskDetailSheet), so the list showed stale dates until full remount/refresh.
    if (isDraggingRef.current) return;
    setLocalGroups(
      sections.map((s) => ({
        id: String(s.sectionId),
        sectionId: s.sectionId,
        title: s.title,
        isDefault: s.isDefault,
        totalTasks: s.totalTasks,
        tasks: s.tasks.map((t) => ({ ...t })),
      })),
    );
  }, [sections]);

  const serverGroups = useMemo(
    () =>
      sections.map((s) => ({
        id: String(s.sectionId),
        sectionId: s.sectionId,
        title: s.title,
        isDefault: s.isDefault,
        totalTasks: s.totalTasks,
        tasks: s.tasks.map((t) => ({ ...t })),
      })),
    [sections],
  );

  const findTaskLocation = useCallback(
    (taskId: string): { groupId: string; index: number } | null => {
      for (const g of localGroups) {
        const idx = g.tasks.findIndex((t) => t._id === taskId);
        if (idx !== -1) return { groupId: g.id, index: idx };
      }
      return null;
    },
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

  const onDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;
      const activeId = String(active.id);
      const overId = String(over.id);
      if (activeId === overId) return;

      const activeLoc = findTaskLocation(activeId);
      if (!activeLoc) return;

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
        const overLoc = findTaskLocation(overId);
        if (!overLoc) return;
        targetGroupId = overLoc.groupId;
        targetIndex = overLoc.index;
      }

      if (activeLoc.groupId === targetGroupId) return;

      setLocalGroups((prev) => {
        const next = prev.map((g) => ({ ...g, tasks: g.tasks.slice() }));
        const fromGroup = next.find((g) => g.id === activeLoc.groupId)!;
        const toGroup = next.find((g) => g.id === targetGroupId)!;
        const [moved] = fromGroup.tasks.splice(activeLoc.index, 1);
        const insertAt = Math.min(targetIndex, toGroup.tasks.length);
        toGroup.tasks.splice(insertAt, 0, moved);
        return next;
      });
    },
    [findTaskLocation, localGroups],
  );

  const onDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const startInfo = activeDrag;
      setActiveDrag(null);
      isDraggingRef.current = false;
      if (!startInfo) return;

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

      if (
        toSectionKey === currentLoc.groupId &&
        currentLoc.index !== newOrderIndex
      ) {
        setLocalGroups((prev) =>
          prev.map((g) =>
            g.id !== toSectionKey
              ? g
              : {
                  ...g,
                  tasks: arrayMove(g.tasks, currentLoc.index, newOrderIndex),
                },
          ),
        );
      }

      const fromGroupId = startInfo.fromGroupId;

      if (
        fromGroupId === toSectionKey &&
        startInfo.fromIndex === newOrderIndex
      ) {
        return;
      }

      const toSectionId = toSectionKey as Id<"listSections">;

      try {
        await moveBetweenSections({
          taskId,
          toSectionId,
          newOrderIndex,
        });
      } catch (err) {
        setLocalGroups(serverGroups);
        // eslint-disable-next-line no-console
        console.error("List section move failed", err);
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
        style={styles.scroll}
        contentContainerStyle={[styles.listContent, listContentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {noSections
          ? ListEmptyComponent
          : localGroups.map((group) => (
              <View key={group.id} style={styles.sectionBlock}>
                {!group.isDefault ? (
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{group.title}</Text>
                    <Text style={styles.sectionCount}>
                      {group.totalTasks} tasks
                    </Text>
                  </View>
                ) : null}
                <SortableContext
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
              </View>
            ))}
        {footer}
      </ScrollView>
      <DragOverlay dropAnimation={null}>
        {activeDrag ? (
          <View style={{ width: "100%", maxWidth: 720, opacity: 0.95 }}>
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
  listContent: { padding: 16, paddingBottom: 24 },
  sectionBlock: { marginBottom: 8 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
  },
  sectionCount: { fontSize: 12, color: Colors.textTertiary },
  rowWrap: { marginBottom: 8 },
  emptyDropZone: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyDropZoneText: { fontSize: 13, color: Colors.textTertiary },
});
