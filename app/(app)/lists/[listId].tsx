import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
} from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { todayYYYYMMDD, formatSecondsAsHM } from "../../../lib/dates";
import { Id } from "../../../convex/_generated/dataModel";

export default function ListDetailScreen() {
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const paginatedList = useQuery(api.lists.getPaginated, {
    listId: listId as Id<"lists">,
  });
  const upsertTask = useMutation(api.tasks.upsert);

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

  if (!paginatedList) {
    return (
      <View style={styles.loading}>
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

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: paginatedList.list.name,
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />

      {sections.every((s) => s.data.length === 0) ? (
        <EmptyState
          title="No tasks in this list"
          message="Add tasks to get started"
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item._id}
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
                onPress={() =>
                  toggleComplete(task._id, !!task.dateCompleted)
                }
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
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
        />
      )}

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 80 },
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
  },
});
