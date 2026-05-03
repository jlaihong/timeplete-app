import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from "react-native";
import { useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { ListDialog } from "../lists/ListDialog";
import { todayYYYYMMDD } from "../../lib/dates";

type ListWithLink = Doc<"lists"> & { trackableId?: Id<"trackables"> | null };

export type InboxPaginatedData = {
  list: Doc<"lists">;
  sections: {
    section: Doc<"listSections">;
    tasks: Doc<"tasks">[];
    totalTasks: number;
  }[];
  totalSections: number;
};

interface InboxTaskListProps {
  /** Inbox row from `lists.search` (includes linked trackable for ListDialog). */
  fullList: ListWithLink;
  paginatedList: InboxPaginatedData;
  onPressAdd?: () => void;
}

/**
 * Inbox captures tasks on the system list — same layout semantics as browsing
 * a normal list (`lists/[listId]`): sections from `lists.getPaginated`,
 * sorted by section order then `sectionOrderIndex`, not by calendar day.
 *
 * Mirrors productivity-one Inbox vs the day-bucketed Tasks home strip.
 */
export function InboxTaskList({
  fullList,
  paginatedList,
  onPressAdd,
}: InboxTaskListProps) {
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
    [upsertTask],
  );

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
                    title="No tasks in Inbox"
                    message="Tap + to capture a task here"
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
                {task.taskDay ? (
                  <Text style={styles.taskMeta}>Scheduled: {task.taskDay}</Text>
                ) : null}
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

      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => onPressAdd?.()}
        accessibilityRole="button"
        accessibilityLabel="Add task to Inbox"
      >
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
