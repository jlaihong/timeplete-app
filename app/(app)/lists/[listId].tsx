import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ListDialog } from "../../../components/lists/ListDialog";
import { todayYYYYMMDD } from "../../../lib/dates";
import { Id } from "../../../convex/_generated/dataModel";

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

  const paginatedList = useQuery(
    api.lists.getPaginated,
    canQueryLists && listId ? { listId } : "skip",
  );
  // We need the linked-trackable id, which only `lists.search` projects in.
  const allLists = useQuery(api.lists.search, canQueryLists ? {} : "skip");
  const fullList = allLists?.find((l) => l._id === listId);
  const upsertTask = useMutation(api.tasks.upsert);
  const [showEditDialog, setShowEditDialog] = useState(false);

  const toggleComplete = useCallback(
    async (taskId: Id<"tasks">, isCompleted: boolean) => {
      await upsertTask({
        id: taskId,
        name: "",
        dateCompleted: isCompleted ? undefined : todayYYYYMMDD(),
      });
    },
    [upsertTask]
  );

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

  const sections = paginatedList.sections.map((s) => ({
    title: s.section.name,
    isDefault: s.section.isDefaultSection,
    totalTasks: s.totalTasks,
    data: s.tasks,
  }));

  const isGoalList = !!paginatedList.list.isGoalList;
  const isEmpty = sections.every((s) => s.data.length === 0);

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: paginatedList.list.name,
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />
      {/*
        Do NOT put this control in `SectionList`/`FlatList` `ListHeaderComponent`
        — on react-native-web the virtualized list's scroll responder frequently
        eats presses on header children, so `onPress` never fires.

        Keep `EmptyState` inside `ListEmptyComponent` only (never as a flex:1
        sibling that can paint over this bar).
      */}
      {!isGoalList && (
        <View style={styles.toolbarWrap}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => setShowEditDialog(true)}
            style={styles.toolbarButton}
            accessibilityLabel="Edit list"
            accessibilityRole="button"
          >
            <Ionicons
              name="settings-outline"
              size={20}
              color={Colors.textSecondary}
            />
            <Text style={styles.toolbarLabel}>List settings</Text>
          </TouchableOpacity>
        </View>
      )}
      <SectionList
        style={styles.sectionList}
        sections={sections}
        keyExtractor={(item) => item._id}
        removeClippedSubviews={false}
        ListEmptyComponent={
          isEmpty
            ? () => (
                <View style={styles.emptyListWrap}>
                  <EmptyState
                    fillScreen={false}
                    title="No tasks in this list"
                    message="Add tasks to get started"
                  />
                </View>
              )
            : undefined
        }
        renderSectionHeader={({ section }) =>
          section.isDefault ? null : (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCount}>
                {section.totalTasks} tasks
              </Text>
            </View>
          )
        }
        renderItem={({ item: task }) => (
          <Card style={styles.taskCard} padded={false}>
            <TouchableOpacity
              style={styles.taskRow}
              onPress={() => toggleComplete(task._id, !!task.dateCompleted)}
            >
              <Ionicons
                name={task.dateCompleted ? "checkbox" : "square-outline"}
                size={22}
                color={
                  task.dateCompleted ? Colors.success : Colors.textTertiary
                }
              />
              <View style={styles.taskContent}>
                <Text
                  style={[
                    styles.taskName,
                    task.dateCompleted && styles.completedTask,
                  ]}
                  numberOfLines={1}
                >
                  {task.name}
                </Text>
                {task.taskDay && (
                  <Text style={styles.taskMeta}>
                    Scheduled: {task.taskDay}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </Card>
        )}
        contentContainerStyle={[
          styles.listContent,
          isEmpty && styles.listContentEmpty,
        ]}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
      />

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      {!isGoalList && (
        <ListDialog
          visible={showEditDialog}
          list={fullList ?? paginatedList.list}
          onClose={() => setShowEditDialog(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  sectionList: { flex: 1, zIndex: 0 },
  listContent: { padding: 16, paddingBottom: 80 },
  listContentEmpty: {
    flexGrow: 1,
    minHeight: 320,
  },
  emptyListWrap: {
    paddingVertical: 24,
    alignSelf: "stretch",
  },
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
  taskCard: { marginBottom: 6 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  taskContent: { flex: 1 },
  taskName: { fontSize: 15, fontWeight: "500", color: Colors.text },
  completedTask: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  taskMeta: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  toolbarWrap: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surface,
    // Paint above the `SectionList` scroll surface on web so hit-testing
    // always targets this bar, not the list's native scroll layer.
    zIndex: 40,
    elevation: 40,
    position: "relative",
  },
  toolbarButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  toolbarLabel: { fontSize: 14, fontWeight: "600", color: Colors.text },
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
});
