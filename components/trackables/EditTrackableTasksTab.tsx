import { CompleteCheckIcon } from "../tasks/CompleteCheckIcon";
import { useCompleteWithFeedback } from "../../hooks/useCompleteWithFeedback";
import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import { useTaskUpsertMutation } from "../../hooks/useTaskUpsertMutation";
import { formatDisplayDate, isToday, todayYYYYMMDD } from "../../lib/dates";
import { Button } from "../ui/Button";
import { AddTaskSheet } from "../tasks/AddTaskSheet";

interface EditTrackableTasksTabProps {
  trackableId: Id<"trackables">;
}

/**
 * Open tasks that count toward a trackable, with an "Add task" action that
 * assigns the new task to this trackable directly — no list has to exist
 * for it. Tasks in a list linked to the trackable appear here too.
 */
export function EditTrackableTasksTab({
  trackableId,
}: EditTrackableTasksTabProps) {
  const { profileReady } = useAuth();
  const today = todayYYYYMMDD();
  const tasks = useQuery(
    api.trackables.getOpenTasks,
    profileReady ? { trackableId, today } : "skip",
  );
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const upsertTask = useTaskUpsertMutation();
  const [showAdd, setShowAdd] = useState(false);
  const { completingIds, complete } = useCompleteWithFeedback();

  const listName = (listId: string | null) => {
    if (!listId) return null;
    const list = lists?.find((l) => l._id === listId);
    return list && !list.isInbox ? list.name : null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.heading}>
          {tasks === undefined
            ? "Tasks"
            : tasks.length === 1
              ? "1 open task"
              : `${tasks.length} open tasks`}
        </Text>
        <Button title="Add task" size="small" onPress={() => setShowAdd(true)} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.list}>
        {tasks === undefined ? (
          <Text style={styles.empty}>Loading tasks…</Text>
        ) : tasks.length === 0 ? (
          <Text style={styles.empty}>
            No open tasks count toward this yet. Add one here, or pick it under
            "Counts toward" on any task.
          </Text>
        ) : (
          tasks.map((task) => {
            const meta = [
              task.taskDay
                ? isToday(task.taskDay)
                  ? "Today"
                  : formatDisplayDate(task.taskDay)
                : "Unscheduled",
              listName(task.listId),
            ]
              .filter(Boolean)
              .join(" · ");
            const completing = completingIds.has(task._id);
            return (
              <View key={task._id} style={styles.row}>
                <Pressable
                  onPress={() =>
                    complete(task._id, () =>
                      void upsertTask({
                        id: task._id,
                        name: task.name,
                        dateCompleted: todayYYYYMMDD(),
                      }),
                    )
                  }
                  hitSlop={8}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: completing }}
                  accessibilityLabel={`Complete ${task.name}`}
                >
                  <CompleteCheckIcon
                    checked={completing}
                    size={22}
                    uncheckedColor={Colors.textSecondary}
                  />
                </Pressable>
                <View style={styles.rowText}>
                  <Text
                    style={[styles.taskName, completing && styles.taskNameDone]}
                  >
                    {task.name}
                  </Text>
                  <Text style={styles.taskMeta}>{meta}</Text>
                </View>
                {task.isRecurringInstance && (
                  <Ionicons
                    name="repeat"
                    size={16}
                    color={Colors.textTertiary}
                  />
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {showAdd && (
        <AddTaskSheet
          defaultTrackableId={trackableId}
          onClose={() => setShowAdd(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minHeight: 0 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  heading: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Colors.text,
  },
  scroll: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  empty: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    paddingVertical: 24,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainer,
  },
  rowText: { flex: 1, minWidth: 0 },
  taskName: { fontSize: FontSize.body, color: Colors.text },
  taskNameDone: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  taskMeta: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
