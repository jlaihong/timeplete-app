import React, {
  useState,
  useCallback,
  useMemo,
  useEffect,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
  Switch,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { EmptyState } from "../../../components/ui/EmptyState";
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
import type { Id, Doc } from "../../../convex/_generated/dataModel";
import { Card } from "../../../components/ui/Card";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

/** `lists.getPaginated` enriches rows with `tagIds` like `tasks.search`. */
type ListPageTask = Doc<"tasks"> & { tagIds?: Id<"tags">[] };

const isWeb = Platform.OS === "web";

function showCompletedStorageKey(listId: string) {
  return `showCompleted:list:${listId}`;
}

function listFilterUsersStorageKey(listId: string) {
  return `listFilterUsers:${listId}`;
}

function taskCompletedForSectionHeader(task: ListPageTask): boolean {
  const d = task.dateCompleted;
  return typeof d === "string" && d.trim().length > 0;
}

function toTaskRowTask(task: ListPageTask): TaskRowTask {
  return {
    _id: task._id,
    name: task.name,
    dateCompleted: task.dateCompleted,
    taskDay: task.taskDay,
    timeSpentInSecondsUnallocated: task.timeSpentInSecondsUnallocated,
    trackableId: task.trackableId,
    listId: task.listId,
    tagIds: task.tagIds as string[] | undefined,
    assignedToUserName: (task as { assignedToUserName?: string })
      .assignedToUserName,
    isRecurringInstance: task.isRecurringInstance,
  };
}

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

  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const canQueryLists = !authLoading && isAuthenticated;

  const [sectionLimit, setSectionLimit] = useState(500);
  /** Keep in sync with `lists.getPaginated` default so completed rows are not silently truncated. */
  const [taskLimit, setTaskLimit] = useState(2500);

  const paginatedList = useQuery(
    api.lists.getPaginated,
    canQueryLists && listId
      ? { listId, sectionLimit, taskLimit }
      : "skip",
  );

  /**
   * When a section exceeds `lists.getPaginated`'s incomplete slice (`taskLimit`),
   * `tasks.length < totalTasks` and `canDragReorder` disables DnD. Adding an
   * incomplete task sorts it first (`sectionOrderIndex: 0`), which can push an
   * older row past the slice and flip the UI into truncated state —
   * "drag suddenly breaks" until the slice is enlarged.
   */
  useEffect(() => {
    if (!paginatedList) return;
    setTaskLimit((prev) => {
      let need = prev;
      for (const s of paginatedList.sections) {
        const deficit = s.totalTasks - s.tasks.length;
        if (deficit > 0) {
          need = Math.max(need, prev + deficit);
        }
      }
      return need;
    });
  }, [paginatedList]);

  const allLists = useQuery(api.lists.search, canQueryLists ? {} : "skip");
  const fullList = allLists?.find((l) => l._id === listId);
  const tags = useQuery(api.tags.search, canQueryLists ? {} : "skip");
  const trackables = useQuery(api.trackables.search, canQueryLists ? {} : "skip");
  const listMembers = useQuery(
    api.sharing.getListMembers,
    canQueryLists && listId ? { listId } : "skip",
  );

  const upsertTask = useMutation(api.tasks.upsert);
  const removeTask = useMutation(api.tasks.remove);
  const deleteRecurringInstance = useMutation(api.recurringTasks.deleteInstance);
  const setTimeSpentMutation = useMutation(api.tasks.setTimeSpent);
  const upsertSection = useMutation(api.listSections.upsert);
  const moveBetweenSections = useMutation(api.tasks.moveBetweenSections);

  const timer = useTimer();

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);
  const [filterUserIds, setFilterUserIds] = useState<string[]>([]);
  const [addTaskSectionId, setAddTaskSectionId] = useState<
    Id<"listSections"> | null
  >(null);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null,
  );
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [collapsedSectionKeys, setCollapsedSectionKeys] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    if (!listId) return;
    let cancelled = false;
    (async () => {
      const sc = await AsyncStorage.getItem(showCompletedStorageKey(listId));
      const show = sc !== "false";
      const raw = await AsyncStorage.getItem(listFilterUsersStorageKey(listId));
      let users: string[] = [];
      if (raw) {
        try {
          users = JSON.parse(raw) as string[];
        } catch {
          users = [];
        }
      }
      if (!cancelled) {
        setShowCompleted(show);
        setFilterUserIds(users);
      }
    })();
    return () => {
      cancelled = true;
    };
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
    if (!listMembers) return [];
    return listMembers.members.filter(
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
    if (!paginatedList) return [];
    return paginatedList.sections.flatMap((s) => s.tasks as ListPageTask[]);
  }, [paginatedList]);

  const filteredSections: ListSection[] = useMemo(() => {
    if (!paginatedList) return [];
    const hasUser = filterUserIds.length > 0;
    return paginatedList.sections.map((block) => {
      const blockTasks = block.tasks as ListPageTask[];
      let forUserFilter = blockTasks;
      if (hasUser) {
        forUserFilter = forUserFilter.filter((task) => {
          const c = task.createdBy;
          const a = task.assignedToUserId;
          return (
            (c && filterUserIds.includes(String(c))) ||
            (a && filterUserIds.includes(String(a)))
          );
        });
      }
      const headerCompletedCount = forUserFilter.filter(
        taskCompletedForSectionHeader,
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
  }, [paginatedList, showCompleted, filterUserIds, collapsedSectionKeys]);

  const defaultSectionId = useMemo((): Id<"listSections"> | undefined => {
    if (!paginatedList?.sections.length) return undefined;
    const def = paginatedList.sections.find((s) => s.section.isDefaultSection);
    return (def ?? paginatedList.sections[0]).section._id;
  }, [paginatedList]);

  const hasMoreSections =
    !!paginatedList && paginatedList.totalSections > paginatedList.sections.length;

  const hasMoreTasks = useMemo(() => {
    if (!paginatedList) return false;
    return paginatedList.sections.some((s) => s.totalTasks > s.tasks.length);
  }, [paginatedList]);

  const isFilterActive = !showCompleted || filterUserIds.length > 0;

  /** Collaborator filter hides rows; indices no longer match section order. Hide-completed does not. */
  const canDragReorder = useMemo(() => {
    if (!paginatedList || filterUserIds.length > 0) return false;
    return paginatedList.sections.every(
      (s) => s.tasks.length >= s.totalTasks,
    );
  }, [paginatedList, filterUserIds]);

  const webDndSections = useMemo(() => {
    return filteredSections.map((s) => ({
      sectionId: s.sectionId,
      title: s.title,
      isDefault: s.isDefault,
      headerCompletedCount: s.headerCompletedCount,
      headerTotalCount: s.headerTotalCount,
      tasks: s.data.map(toTaskRowTask),
    }));
  }, [filteredSections]);

  const persistShowCompleted = useCallback(
    async (checked: boolean) => {
      setShowCompleted(checked);
      if (listId) {
        await AsyncStorage.setItem(
          showCompletedStorageKey(listId),
          String(checked),
        );
      }
    },
    [listId],
  );

  const toggleUserFilter = useCallback(
    async (userId: string, checked: boolean) => {
      setFilterUserIds((prev) => {
        const next = checked
          ? [...prev, userId]
          : prev.filter((id) => id !== userId);
        if (listId) {
          void AsyncStorage.setItem(
            listFilterUsersStorageKey(listId),
            JSON.stringify(next),
          );
        }
        return next;
      });
    },
    [listId],
  );

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

  const listTitle = paginatedList?.list.name ?? "List";

  if (!listId) {
    return (
      <View style={styles.loading}>
        <Text>Missing list id.</Text>
      </View>
    );
  }

  if (authLoading) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: "List" }} />
        <Text>Loading list...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: "List" }} />
        <Text>You need to sign in to view this list.</Text>
      </View>
    );
  }

  if (paginatedList === undefined) {
    return (
      <View style={styles.loading}>
        <Stack.Screen options={{ title: "List" }} />
        <Text>Loading list...</Text>
      </View>
    );
  }

  const noSections = paginatedList.sections.length === 0;

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

      <Modal
        visible={filterMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setFilterMenuOpen(false)}
        >
          <Pressable style={styles.filterSheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.filterSheetTitle}>Filters</Text>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>Show completed</Text>
              <Switch
                value={showCompleted}
                onValueChange={(v) => {
                  void persistShowCompleted(v);
                }}
                trackColor={{
                  false: Colors.outlineVariant,
                  true: Colors.primary + "60",
                }}
                thumbColor={showCompleted ? Colors.primary : Colors.textTertiary}
              />
            </View>
            {showCollaboratorFilter && (
              <>
                <Text style={styles.filterSectionLabel}>Filter by user</Text>
                <ScrollView style={styles.filterUserScroll}>
                  {assignableMembers.map((m) => (
                    <View key={m.userId} style={styles.filterRow}>
                      <Text style={styles.filterLabel}>{m.name}</Text>
                      <Switch
                        value={filterUserIds.includes(String(m.userId))}
                        onValueChange={(v) =>
                          void toggleUserFilter(String(m.userId), v)
                        }
                        trackColor={{
                          false: Colors.outlineVariant,
                          true: Colors.primary + "60",
                        }}
                        thumbColor={
                          filterUserIds.includes(String(m.userId))
                            ? Colors.primary
                            : Colors.textTertiary
                        }
                      />
                    </View>
                  ))}
                </ScrollView>
              </>
            )}
            <Button
              title="Done"
              onPress={() => setFilterMenuOpen(false)}
              style={{ marginTop: 12 }}
            />
          </Pressable>
        </Pressable>
      </Modal>

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

      {isWeb ? (
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
      <SectionList
        style={styles.sectionList}
        sections={filteredSections}
        keyExtractor={(item) => item._id}
        removeClippedSubviews={false}
        ListEmptyComponent={
          noSections
            ? () => (
                <View style={styles.emptyListWrap}>
                  <EmptyState
                    fillScreen={false}
                    title="No sections found"
                    message=""
                  />
                </View>
              )
            : undefined
        }
        renderSectionHeader={({ section }) => {
          const collapsed = collapsedSectionKeys.has(section.sectionKey);
          const countSuffix = listSectionCountSuffix(
            section.headerCompletedCount,
            section.headerTotalCount,
          );
          return (
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
                  <Text style={styles.sectionCountInline}>{countSuffix}</Text>
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setAddTaskSectionId(section.sectionId)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.sectionAddBtn}
                accessibilityRole="button"
                accessibilityLabel={`Add task to ${section.title}`}
              >
                <Ionicons name="add" size={26} color={Colors.primary} />
              </TouchableOpacity>
            </View>
          );
        }}
        renderItem={({ item: task }) => {
          const meta = buildMeta(task, tagMap, listMap, trackableMap);
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
            <Card style={styles.taskCard} padded={false}>
              <TouchableOpacity
                style={styles.taskRow}
                onPress={() => setSelectedTaskId(task._id)}
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
                        color={
                          isTicking ? Colors.success : Colors.textSecondary
                        }
                      />
                    </TouchableOpacity>
                  )}
                  <Text
                    style={[
                      styles.duration,
                      isTicking && styles.durationActive,
                    ]}
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
                  ))}
                </View>
              )}
            </Card>
          );
        }}
        ListFooterComponent={() => listFooter}
        contentContainerStyle={[
          styles.listContent,
          noSections && styles.listContentEmpty,
        ]}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => {
          if (defaultSectionId) setAddTaskSectionId(defaultSectionId);
        }}
        accessibilityRole="button"
        accessibilityLabel="Add task"
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      <ListDialog
        visible={showEditDialog}
        list={fullList ?? paginatedList.list}
        onClose={() => setShowEditDialog(false)}
      />

      {addTaskSectionId && listId && (
        <AddTaskSheet
          listId={listId}
          sectionId={addTaskSectionId}
          lockListToContext
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
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginTop: 12,
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: 12,
  },
  filterLabel: { fontSize: 15, color: Colors.text, flex: 1 },
  filterUserScroll: { maxHeight: 220 },
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
  sectionAddBtn: {
    padding: 4,
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
