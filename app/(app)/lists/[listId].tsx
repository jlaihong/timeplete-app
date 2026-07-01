import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import {
  NestableScrollContainer,
  NestableDraggableFlatList,
  type RenderItemParams,
} from "react-native-draggable-flatlist";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { EmptyState } from "../../../components/ui/EmptyState";
import { SectionHeadingAddButton } from "../../../components/ui/SectionHeadingAddButton";
import { ListDialog } from "../../../components/lists/ListDialog";
import { AddTaskSheet } from "../../../components/tasks/AddTaskSheet";
import { TaskDetailSheet } from "../../../components/tasks/TaskDetailSheet";
import {
  type TaskRowMeta,
  type TaskRowTask,
} from "../../../components/tasks/TaskRowDesktop";
import { ListDetailWebDnd } from "../../../components/lists/ListDetailWebDnd";
import { useTimer } from "../../../hooks/useTimer";
import { todayYYYYMMDD, formatSecondsAsHM } from "../../../lib/dates";
import { normalizeListMembersQuery } from "../../../lib/listMembersQuery";
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { useAuth } from "../../../hooks/useAuth";
import { useTaskUpsertMutation } from "../../../hooks/useTaskUpsertMutation";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { TaskFilterModal } from "../../../components/tasks/TaskFilterModal";
import { useTaskFilters } from "../../../hooks/useTaskFilters";
import {
  taskCompletedForFilters,
  taskMatchesUserFilter,
} from "../../../lib/taskFilters";
import { applySetTimeSpentOptimisticUpdate } from "../../../lib/setTimeSpentOptimisticUpdate";
import { calendarGridIANAZoneForManualEvents } from "../../../lib/calendarGridTimeZone";
import { applyTaskRemoveOptimisticUpdate } from "../../../lib/taskRemoveOptimisticUpdate";
import { useRegisterEscapeClose } from "../../../hooks/useRegisterEscapeClose";

/** `lists.getPaginated` enriches rows with `tagIds` like `tasks.search`. */
type ListPageTask = Doc<"tasks"> & { tagIds?: Id<"tags">[] };

const isWeb = Platform.OS === "web";

function buildMeta(
  task: ListPageTask,
  tagMap: Map<string, { name: string; colour: string }>,
  listMap: Map<
    string,
    { name: string; colour: string; isGoalList?: boolean; isInbox?: boolean }
  >,
  trackableMap: Map<string, { name: string; colour: string }>,
): TaskRowMeta {
  const tags = (task.tagIds ?? [])
    .map((id: Id<"tags">) => tagMap.get(id))
    .filter(Boolean) as { name: string; colour: string }[];
  const list = task.listId ? (listMap.get(task.listId) ?? null) : null;
  const trackable = task.trackableId
    ? (trackableMap.get(task.trackableId) ?? null)
    : null;
  return { tags, list, trackable };
}

interface ListSection {
  /** SectionList key */
  sectionKey: string;
  sectionId: Id<"listSections">;
  title: string;
  isDefault: boolean;
  totalTasks: number;
  loadedTasks: number;
  /** Header counts: ignore “show completed” row filter; optional user filter only. */
  headerCompletedCount: number;
  headerTotalCount: number;
  data: ListPageTask[];
}

function listSectionCountSuffix(completed: number, total: number): string {
  if (total === 0) return "";
  return ` ${completed}/${total}`;
}

interface ContextMenuState {
  taskId: Id<"tasks">;
  x: number;
  y: number;
}

function ContextMenuPopover({
  x,
  y,
  onDelete,
}: {
  x: number;
  y: number;
  onDelete: () => void;
}) {
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
      >
        <MaterialIcons name="delete" size={18} color={Colors.text} />
        <span>Delete task</span>
      </button>
    </div>
  );
}

export default function ListDetailScreen() {
  const { listId: listIdParam } = useLocalSearchParams<{
    listId: string | string[];
  }>();
  const listId = useMemo((): Id<"lists"> | null => {
    const raw = listIdParam;
    if (raw == null) return null;
    const s = Array.isArray(raw) ? raw[0] : raw;
    return s ? (s as Id<"lists">) : null;
  }, [listIdParam]);

  const { profileReady, isLoading, isAuthenticated } = useAuth();
  const canQueryLists = profileReady;

  const [sectionLimit, setSectionLimit] = useState(500);
  /** Keep in sync with `lists.getPaginated` default so completed rows are not silently truncated. */
  const [taskLimit, setTaskLimit] = useState(2500);

  const paginatedList = useQuery(
    api.lists.getPaginated,
    canQueryLists && listId
      ? { listId, sectionLimit, taskLimit }
      : "skip",
  );

  const paginatedData = useMemo(() => {
    const v = paginatedList;
    if (
      v === undefined ||
      v === null ||
      v instanceof Error ||
      typeof v !== "object" ||
      !("list" in v) ||
      !("sections" in v)
    ) {
      return null;
    }
    return v;
  }, [paginatedList]);

  const paginatedError =
    paginatedList instanceof Error ? paginatedList : null;

  const allLists = useQuery(api.lists.search, canQueryLists ? {} : "skip");
  const fullList = allLists?.find((l) => l._id === listId);

  const listQueryMatchesRoute =
    paginatedData != null && paginatedData.list._id === listId;

  const listTitle = useMemo(() => {
    const fromSidebar = fullList?.name?.trim();
    if (fromSidebar) return fromSidebar;
    if (listQueryMatchesRoute && paginatedData) return paginatedData.list.name;
    return "List";
  }, [fullList?.name, listQueryMatchesRoute, paginatedData]);

  /**
   * When a section exceeds `lists.getPaginated`'s incomplete slice (`taskLimit`),
   * `tasks.length < totalTasks` and `canDragReorder` disables DnD. Adding an
   * incomplete task sorts it first (`sectionOrderIndex: 0`), which can push an
   * older row past the slice and flip the UI into truncated state —
   * "drag suddenly breaks" until the slice is enlarged.
   */
  useEffect(() => {
    if (!paginatedData) return;
    if (paginatedData.list._id !== listId) return;
    setTaskLimit((prev) => {
      let need = prev;
      for (const s of paginatedData.sections) {
        const deficit = s.totalTasks - s.tasks.length;
        if (deficit > 0) {
          need = Math.max(need, prev + deficit);
        }
      }
      return need;
    });
  }, [paginatedData, listId]);
  const tags = useQuery(api.tags.search, canQueryLists ? {} : "skip");
  const trackables = useQuery(api.trackables.search, canQueryLists ? {} : "skip");
  const listMembers = useQuery(
    api.sharing.getListMembers,
    canQueryLists && listId ? { listId } : "skip",
  );

  const upsertTask = useTaskUpsertMutation();
  const removeTask = useMutation(api.tasks.remove).withOptimisticUpdate(
    (localStore, args) => {
      applyTaskRemoveOptimisticUpdate(localStore, args.id);
    },
  );
  const deleteRecurringInstance = useMutation(
    api.recurringTasks.deleteInstance,
  ).withOptimisticUpdate((localStore, args) => {
    applyTaskRemoveOptimisticUpdate(localStore, args.taskId, {
      cascadeRootChildren: false,
    });
  });
  const timer = useTimer();
  const clientCalendarIANAZone = useMemo(
    () =>
      calendarGridIANAZoneForManualEvents({
        isTimerRunning: timer.isRunning,
        canonicalTimerIANAZone: timer.canonicalTimeZone,
      }),
    [timer.isRunning, timer.canonicalTimeZone],
  );
  const optimisticGridTzRef = useRef(clientCalendarIANAZone);
  optimisticGridTzRef.current = clientCalendarIANAZone;
  const setTimeSpentMutation = useMutation(
    api.tasks.setTimeSpent,
  ).withOptimisticUpdate((localStore, args) => {
    applySetTimeSpentOptimisticUpdate(localStore, {
      taskId: args.taskId,
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated,
      optimisticGridIANAZone: optimisticGridTzRef.current,
    });
  });
  const upsertSection = useMutation(api.listSections.upsert);
  const moveBetweenSections = useMutation(api.tasks.moveBetweenSections);

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterScope = useMemo(
    () => (listId ? ({ kind: "list" as const, listId }) : null),
    [listId],
  );
  const {
    showCompleted,
    filterUserIds,
    persistShowCompleted,
    toggleUserFilter,
    isFilterActive,
  } = useTaskFilters(filterScope);
  const [addTaskSectionId, setAddTaskSectionId] = useState<
    Id<"listSections"> | null
  >(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  useRegisterEscapeClose(
    () => setShowAddSection(false),
    showAddSection,
  );
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    setSectionLimit(500);
    setTaskLimit(2500);
    setCollapsedSectionKeys(() => new Set());
    setSelectedTaskId(null);
    setContextMenu(null);
    setAddTaskSectionId(null);
    setShowAddSection(false);
    setNewSectionName("");
    setShowEditDialog(false);
    setFilterMenuOpen(false);
  }, [listId]);

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

  const assignableMembers = useMemo(() => {
    const normalized = normalizeListMembersQuery(listMembers);
    if (!normalized) return [];
    return normalized.members.filter(
      (m) => m.permission === "OWNER" || m.permission === "EDITOR",
    );
  }, [listMembers]);
  const showCollaboratorFilter = assignableMembers.length > 1;

  const tagMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    tags?.forEach((t) => m.set(t._id, { name: t.name, colour: t.colour }));
    return m;
  }, [tags]);

  const listMap = useMemo(() => {
    const m = new Map<
      string,
      { name: string; colour: string; isGoalList?: boolean; isInbox?: boolean }
    >();
    allLists?.forEach((l) =>
      m.set(l._id, {
        name: l.name,
        colour: l.colour,
        isGoalList: l.isGoalList,
        isInbox: l.isInbox,
      }),
    );
    return m;
  }, [allLists]);

  const trackableMap = useMemo(() => {
    const m = new Map<string, { name: string; colour: string }>();
    trackables?.forEach((t) =>
      m.set(t._id, { name: t.name, colour: t.colour }),
    );
    return m;
  }, [trackables]);

  const allTasksInPage = useMemo((): ListPageTask[] => {
    if (!paginatedData) return [];
    return paginatedData.sections.flatMap((s) => s.tasks as ListPageTask[]);
  }, [paginatedData]);

  const filteredSections: ListSection[] = useMemo(() => {
    if (!paginatedData) return [];
    const hasUser = filterUserIds.length > 0;
    return paginatedData.sections.map((block) => {
      const blockTasks = block.tasks as ListPageTask[];
      let forUserFilter = blockTasks;
      if (hasUser) {
        forUserFilter = forUserFilter.filter((task) =>
          taskMatchesUserFilter(task, filterUserIds),
        );
      }
      const headerCompletedCount = forUserFilter.filter(
        taskCompletedForFilters,
      ).length;
      const headerTotalCount = hasUser
        ? forUserFilter.length
        : block.totalTasks;

      let items = forUserFilter;
      if (!showCompleted) {
        items = items.filter((t) => !t.dateCompleted);
      }
      const sectionKey = String(block.section._id);
      const collapsed = collapsedSectionKeys.has(sectionKey);
      return {
        sectionKey,
        sectionId: block.section._id,
        title: block.section.name,
        isDefault: block.section.isDefaultSection,
        totalTasks: block.totalTasks,
        loadedTasks: block.tasks.length,
        headerCompletedCount,
        headerTotalCount,
        data: collapsed ? [] : items,
      };
    });
  }, [paginatedData, showCompleted, filterUserIds, collapsedSectionKeys]);

  const defaultSectionId = useMemo((): Id<"listSections"> | undefined => {
    if (!paginatedData?.sections.length) return undefined;
    const def = paginatedData.sections.find((s) => s.section.isDefaultSection);
    return (def ?? paginatedData.sections[0]).section._id;
  }, [paginatedData]);

  const hasMoreSections =
    !!paginatedData &&
    paginatedData.totalSections > paginatedData.sections.length;

  const hasMoreTasks = useMemo(() => {
    if (!paginatedData) return false;
    return paginatedData.sections.some((s) => s.totalTasks > s.tasks.length);
  }, [paginatedData]);

  /** Collaborator filter hides rows; indices no longer match section order. Hide-completed does not. */
  const canDragReorder = useMemo(() => {
    if (!paginatedData || filterUserIds.length > 0) return false;
    return paginatedData.sections.every(
      (s) => s.tasks.length >= s.totalTasks,
    );
  }, [paginatedData, filterUserIds]);

  const webDndSections = useMemo(() => {
    return filteredSections.map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      isDefault: s.isDefault,
      headerCompletedCount: s.headerCompletedCount,
      headerTotalCount: s.headerTotalCount,
      /** `TaskRowDesktop` consumes a subset of `Doc<"tasks">` — avoid per-row object churn. */
      tasks: s.data as unknown as TaskRowTask[],
    }));
  }, [filteredSections]);

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
    [upsertTask, timer],
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
    [timer],
  );

  const handleSetTimeSpent = useCallback(
    async (taskId: Id<"tasks">, newSeconds: number) => {
      const safe = Math.max(0, Math.floor(newSeconds));
      await setTimeSpentMutation({
        taskId,
        timeSpentInSecondsUnallocated: safe,
        // Must mirror the optimistic update above so the wall-clock
        // slice the server inserts lines up byte-for-byte with what
        // the cache already shows.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    [setTimeSpentMutation],
  );

  const handleDelete = useCallback(
    async (taskId: Id<"tasks">) => {
      const task = allTasksInPage.find((t) => t._id === taskId);
      if (task?.isRecurringInstance && task.recurringTaskId) {
        await deleteRecurringInstance({ taskId });
      } else {
        await removeTask({ id: taskId });
      }
    },
    [removeTask, deleteRecurringInstance, allTasksInPage],
  );

  const openContextMenu = useCallback(
    (taskId: Id<"tasks">, x: number, y: number) => {
      setContextMenu({ taskId, x, y });
    },
    [],
  );

  const handleAddSection = useCallback(async () => {
    const name = newSectionName.trim();
    if (!listId || !name) return;
    await upsertSection({ listId, name });
    setNewSectionName("");
    setShowAddSection(false);
  }, [listId, newSectionName, upsertSection]);

  const toggleSectionCollapsed = useCallback((sectionKey: string) => {
    setCollapsedSectionKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) next.delete(sectionKey);
      else next.add(sectionKey);
      return next;
    });
  }, []);

  if (!listId) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingMessage}>Missing list id.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: "List" }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingMessage}>Loading list…</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: "List" }} />
        <Text style={styles.loadingMessage}>
          You need to sign in to view this list.
        </Text>
      </View>
    );
  }

  const tasksReady = listQueryMatchesRoute;

  const noSections =
    tasksReady && paginatedData != null && paginatedData.sections.length === 0;

  const listFooter = (
    <View style={styles.listFooter}>
      {hasMoreSections ? (
        <Button
          title="Load more sections"
          variant="secondary"
          onPress={() => setSectionLimit((n) => n + 100)}
        />
      ) : null}
      {hasMoreTasks ? (
        <Button
          title="Load more tasks"
          variant="secondary"
          onPress={() => setTaskLimit((n) => n + 500)}
        />
      ) : null}
      <Button
        title="Add section"
        variant="ghost"
        onPress={() => setShowAddSection(true)}
      />
      <View style={{ height: 88 }} />
    </View>
  );

  /**
   * One task row. Shared between the native `NestableDraggableFlatList`
   * path (long-press drag to reorder within a section) and the
   * non-draggable fallback `.map()` path used when drag is disabled
   * (e.g. truncated-by-pagination state, collaborator filter active).
   * `onLongPressDrag` is the drag-activation callback supplied by the
   * draggable flatlist; binding it to the row's `onLongPress` is what
   * makes a long-press start a drag on the device.
   */
  const renderListTaskRow = (
    task: ListPageTask,
    opts: { onLongPressDrag?: () => void; isActive?: boolean } = {},
  ) => {
    const { onLongPressDrag, isActive } = opts;
    const isTicking = timer.isRunning && timer.taskId === task._id;

    const isCompleted = !!task.dateCompleted;
    const timeSpent = task.timeSpentInSecondsUnallocated ?? 0;
    const totalTime = isTicking ? timeSpent + timer.elapsed : timeSpent;
    const trackable = task.trackableId
      ? trackableMap.get(task.trackableId)
      : null;
    const list = task.listId ? listMap.get(task.listId) : null;
    const taskTags = (task.tagIds ?? [])
      .map((tid: Id<"tags">) => tagMap.get(tid))
      .filter(Boolean) as { name: string; colour: string }[];

    return (
      <View style={isActive ? styles.taskCardDragging : undefined}>
        <Card style={styles.taskCard} padded={false}>
          <TouchableOpacity
            style={styles.taskRow}
            onPress={() => setSelectedTaskId(task._id)}
            onLongPress={onLongPressDrag}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            <TouchableOpacity
              onPress={(e) => {
                e.stopPropagation?.();
                void toggleComplete(task._id, task.name, isCompleted);
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={isCompleted ? "checkmark-circle" : "ellipse-outline"}
                size={24}
                color={isCompleted ? Colors.success : Colors.textTertiary}
              />
            </TouchableOpacity>
            <Text
              style={[styles.taskName, isCompleted && styles.completedTask]}
              numberOfLines={1}
            >
              {task.name}
            </Text>
            <View style={styles.timeCol}>
              {!isCompleted && (
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleToggleTimer(task._id);
                  }}
                >
                  <Ionicons
                    name={isTicking ? "pause" : "play-outline"}
                    size={20}
                    color={isTicking ? Colors.success : Colors.textSecondary}
                  />
                </TouchableOpacity>
              )}
              <Text
                style={[styles.duration, isTicking && styles.durationActive]}
              >
                {formatSecondsAsHM(totalTime)}
              </Text>
            </View>
          </TouchableOpacity>
          {(trackable ||
            (!task.trackableId &&
              list &&
              !list.isGoalList &&
              !list.isInbox) ||
            taskTags.length > 0) && (
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
                      { color: trackable.colour || Colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {trackable.name}
                  </Text>
                </View>
              )}
              {!trackable && list && !list.isGoalList && !list.isInbox && (
                <View style={styles.tagChip}>
                  <Ionicons
                    name="list"
                    size={13}
                    color={list.colour || Colors.text}
                  />
                  <Text
                    style={[
                      styles.tagName,
                      { color: list.colour || Colors.text },
                    ]}
                    numberOfLines={1}
                  >
                    {list.name}
                  </Text>
                </View>
              )}
              {taskTags.map(
                (tag: { name: string; colour: string }, i: number) => (
                  <View key={i} style={styles.tagChip}>
                    <Ionicons
                      name="pricetag"
                      size={12}
                      color={tag.colour}
                    />
                    <Text
                      style={[styles.tagName, { color: tag.colour }]}
                      numberOfLines={1}
                    >
                      {tag.name}
                    </Text>
                  </View>
                ),
              )}
            </View>
          )}
        </Card>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: listTitle,
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />

      <View style={styles.toolbarOuter}>
        <View style={styles.toolbarInner}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowEditDialog(true)}
            style={styles.nameButton}
            accessibilityRole="button"
            accessibilityLabel={`List details, ${listTitle}`}
          >
            <Text style={styles.listNameText} numberOfLines={1}>
              {listTitle}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setFilterMenuOpen(true)}
            style={styles.filterIconBtn}
            accessibilityLabel="Filters"
            hitSlop={10}
          >
            <MaterialIcons
              name="filter-list"
              size={26}
              color={isFilterActive ? Colors.primary : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>
      </View>

      <TaskFilterModal
        visible={filterMenuOpen}
        onClose={() => setFilterMenuOpen(false)}
        showCompleted={showCompleted}
        onPersistShowCompleted={persistShowCompleted}
        filterUserIds={filterUserIds}
        onToggleUserFilter={toggleUserFilter}
        assignableMembers={assignableMembers.map((m) => ({
          userId: String(m.userId),
          name: m.name,
        }))}
        showCollaboratorFilter={showCollaboratorFilter}
      />

      <Modal
        visible={showAddSection}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddSection(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setShowAddSection(false)}
        >
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.filterSheetTitle}>Add section</Text>
            <Input
              label="Name"
              value={newSectionName}
              onChangeText={setNewSectionName}
              placeholder="Section name"
            />
            <View style={styles.addSectionActions}>
              <Button title="Cancel" variant="ghost" onPress={() => setShowAddSection(false)} />
              <Button title="Save" onPress={() => void handleAddSection()} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {paginatedError ? (
        <View style={[styles.sectionList, styles.tasksLoadingPanel]}>
          <Text style={styles.loadingMessage} accessibilityRole="alert">
            {paginatedError.message || "Could not load this list."}
          </Text>
        </View>
      ) : !tasksReady ? (
        <View style={[styles.sectionList, styles.tasksLoadingPanel]}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingMessage}>Loading tasks…</Text>
        </View>
      ) : isWeb ? (
        <View style={styles.sectionList}>
          <ListDetailWebDnd
            sections={webDndSections}
            buildMeta={(task) =>
              buildMeta(task as ListPageTask, tagMap, listMap, trackableMap)
            }
            canDrag={canDragReorder}
            isTicking={(id) => timer.isRunning && timer.taskId === id}
            timerElapsed={timer.elapsed}
            onSelectTask={setSelectedTaskId}
            onToggleComplete={(id) => {
              const task = allTasksInPage.find((t) => t._id === id);
              if (task) {
                void toggleComplete(id, task.name, !!task.dateCompleted);
              }
            }}
            onToggleTimer={handleToggleTimer}
            onSetTimeSpent={handleSetTimeSpent}
            onRequestContextMenu={openContextMenu}
            moveBetweenSections={async (args) => {
              await moveBetweenSections(args);
            }}
            onAddTaskToSection={(sid) => setAddTaskSectionId(sid)}
            listContentStyle={
              noSections
                ? [styles.listContent, styles.listContentEmpty]
                : styles.listContent
            }
            footer={listFooter}
            ListEmptyComponent={
              noSections ? (
                <View style={styles.emptyListWrap}>
                  <EmptyState
                    fillScreen={false}
                    title="No sections found"
                    message=""
                  />
                </View>
              ) : undefined
            }
          />
        </View>
      ) : (
        /**
         * Native list view. Uses `NestableScrollContainer` so the per-section
         * `NestableDraggableFlatList`s can auto-scroll the outer page while
         * dragging, and so multiple draggable lists can coexist on one screen
         * without warnings about "VirtualizedLists in plain ScrollViews".
         * Cross-section drag is intentionally out of scope here — within-
         * section reorder only (matches the legacy productivity-one
         * touch-delay behaviour).
         */
        <NestableScrollContainer
          style={styles.sectionList}
          contentContainerStyle={[
            styles.listContent,
            noSections && styles.listContentEmpty,
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {noSections && (
            <View style={styles.emptyListWrap}>
              <EmptyState
                fillScreen={false}
                title="No sections found"
                message=""
              />
            </View>
          )}

          {filteredSections.map((section) => {
            const collapsed = collapsedSectionKeys.has(section.sectionKey);
            const countSuffix = listSectionCountSuffix(
              section.headerCompletedCount,
              section.headerTotalCount,
            );
            return (
              <View key={section.sectionKey}>
                <View style={styles.sectionHeaderRow}>
                  <TouchableOpacity
                    style={styles.sectionHeaderMain}
                    onPress={() => toggleSectionCollapsed(section.sectionKey)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !collapsed }}
                    accessibilityLabel={`${section.title}, ${collapsed ? "collapsed" : "expanded"}`}
                  >
                    <MaterialIcons
                      name="arrow-forward-ios"
                      size={18}
                      color={Colors.textTertiary}
                      style={[
                        styles.sectionExpandArrow,
                        !collapsed && styles.sectionExpandArrowOpen,
                      ]}
                    />
                    <Text style={styles.sectionTitle} numberOfLines={1}>
                      {section.title}
                      <Text style={styles.sectionCountInline}>
                        {countSuffix}
                      </Text>
                    </Text>
                  </TouchableOpacity>
                  <SectionHeadingAddButton
                    onPress={() => setAddTaskSectionId(section.sectionId)}
                    accessibilityLabel={`Add task to ${section.title}`}
                    hitSlop={10}
                  />
                </View>

                {!collapsed &&
                  (canDragReorder && section.data.length > 0 ? (
                    <NestableDraggableFlatList
                      data={section.data}
                      keyExtractor={(t: any) => t._id}
                      activationDistance={5}
                      // Disable autoscroll. See TaskList.tsx for the
                      // divide-by-zero rationale — keep `autoscrollSpeed={0}`
                      // alone and leave `autoscrollThreshold` at its default
                      // so the internal math doesn't produce a NaN.
                      autoscrollSpeed={0}
                      onDragEnd={({
                        from,
                        to,
                      }: {
                        from: number;
                        to: number;
                      }) => {
                        if (from === to) return;
                        const moved = section.data[from];
                        if (!moved) return;
                        void moveBetweenSections({
                          taskId: moved._id as Id<"tasks">,
                          toSectionId: section.sectionId,
                          newOrderIndex: to,
                        });
                      }}
                      renderItem={({
                        item,
                        drag,
                        isActive,
                      }: RenderItemParams<ListPageTask>) =>
                        renderListTaskRow(item, {
                          onLongPressDrag: drag,
                          isActive,
                        })
                      }
                    />
                  ) : (
                    section.data.map((task) => (
                      <View key={task._id}>{renderListTaskRow(task)}</View>
                    ))
                  ))}
              </View>
            );
          })}

          {listFooter}
        </NestableScrollContainer>
      )}

      {tasksReady ? (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => {
            if (defaultSectionId) setAddTaskSectionId(defaultSectionId);
          }}
          accessibilityRole="button"
          accessibilityLabel="Add task"
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
      ) : null}

      <ListDialog
        visible={showEditDialog}
        list={fullList ?? paginatedData?.list ?? null}
        onClose={() => setShowEditDialog(false)}
      />

      {addTaskSectionId && listId && (
        <AddTaskSheet
          listId={listId}
          sectionId={addTaskSectionId}
          lockListToContext
          defaultTrackableId={
            fullList != null && fullList.trackableId != null
              ? (fullList.trackableId as Id<"trackables">)
              : undefined
          }
          onClose={() => setAddTaskSectionId(null)}
        />
      )}

      {selectedTaskId && (
        <TaskDetailSheet
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    padding: 24,
    gap: 12,
  },
  loadingMessage: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  tasksLoadingPanel: {
    flexGrow: 1,
    minHeight: 280,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    gap: 14,
  },
  toolbarOuter: {
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surface,
    zIndex: 40,
    elevation: 40,
  },
  toolbarInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
    maxWidth: 672,
  },
  nameButton: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  listNameText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.primary,
  },
  filterIconBtn: { padding: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  filterSheet: {
    width: "100%",
    maxWidth: 400,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  filterSheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 16,
  },
  sectionList: {
    flex: 1,
    zIndex: 0,
    ...Platform.select({
      web: {
        width: "100%",
        maxWidth: 672,
        alignSelf: "center",
      },
      default: {},
    }),
  },
  listContent: { padding: 16, paddingBottom: 24 },
  listContentEmpty: {
    flexGrow: 1,
    minHeight: 320,
  },
  listFooter: { gap: 12, marginTop: 8, alignItems: "stretch" },
  emptyListWrap: {
    paddingVertical: 24,
    alignSelf: "stretch",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 2,
    gap: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    marginBottom: 8,
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
  sectionExpandArrow: {
    ...Platform.select({
      web: { transition: "transform 150ms ease" } as object,
      default: {},
    }),
  },
  sectionExpandArrowOpen: {
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
  taskCardWrap: { marginBottom: 8 },
  taskCard: { marginBottom: 6 },
  /** Visual cue while a native long-press drag is active. */
  taskCardDragging: {
    opacity: 0.85,
    transform: [{ scale: 1.02 }],
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  taskName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "500",
    color: Colors.text,
  },
  completedTask: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  timeCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: 72,
    justifyContent: "flex-end",
  },
  duration: { fontSize: 13, color: Colors.textSecondary },
  durationActive: { color: Colors.success, fontWeight: "600" },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    maxWidth: "48%",
  },
  tagName: { fontSize: 12 },
  fab: {
    zIndex: 30,
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
  },
  addSectionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 16,
  },
});
