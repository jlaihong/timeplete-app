import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDate,
  isToday,
  isPast,
  formatSecondsAsHM,
} from "../../../lib/dates";
import { useTimer } from "../../../hooks/useTimer";
import { Id } from "../../../convex/_generated/dataModel";

export default function TasksScreen() {
  const today = todayYYYYMMDD();
  const [weekOffset, setWeekOffset] = useState(0);
  const startDay = addDays(today, weekOffset * 7);
  const endDay = addDays(startDay, 6);

  const tasks = useQuery(api.tasks.search, {
    startDay,
    endDay,
    includeCompleted: true,
  });
  const upsertTask = useMutation(api.tasks.upsert);
  const timer = useTimer();

  const [showAddTask, setShowAddTask] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const groupedTasks = useMemo(() => {
    if (!tasks) return [];
    const groups = new Map<string, typeof tasks>();

    const overdueKey = "overdue";
    for (const task of tasks) {
      const day = task.taskDay ?? "unscheduled";
      const key = day !== "unscheduled" && isPast(day) && !isToday(day) ? overdueKey : day;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(task);
    }

    const entries = Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "overdue") return -1;
      if (b === "overdue") return 1;
      if (a === "unscheduled") return 1;
      if (b === "unscheduled") return -1;
      return a.localeCompare(b);
    });

    return entries.map(([day, dayTasks]) => ({
      day,
      label:
        day === "overdue"
          ? "Overdue"
          : day === "unscheduled"
            ? "Unscheduled"
            : isToday(day)
              ? "Today"
              : formatDisplayDate(day),
      tasks: dayTasks.sort((a, b) => a.taskDayOrderIndex - b.taskDayOrderIndex),
    }));
  }, [tasks]);

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

  const handleAddTask = useCallback(async () => {
    if (!newTaskName.trim()) return;
    await upsertTask({
      name: newTaskName.trim(),
      taskDay: today,
    });
    setNewTaskName("");
    setShowAddTask(false);
  }, [newTaskName, upsertTask, today]);

  if (!tasks) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading tasks...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.weekNav}>
        <TouchableOpacity onPress={() => setWeekOffset((w) => w - 1)}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekOffset(0)}>
          <Text style={styles.weekLabel}>
            {weekOffset === 0 ? "This Week" : `Week ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekOffset((w) => w + 1)}>
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {groupedTasks.length === 0 ? (
        <EmptyState
          title="No tasks this week"
          message="Tap + to add your first task"
        />
      ) : (
        <FlatList
          data={groupedTasks}
          keyExtractor={(item) => item.day}
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <Text
                style={[
                  styles.groupLabel,
                  group.day === "overdue" && styles.overdueLabel,
                ]}
              >
                {group.label}
                <Text style={styles.taskCount}>
                  {" "}
                  ({group.tasks.length})
                </Text>
              </Text>
              {group.tasks.map((task) => (
                <Card key={task._id} style={styles.taskCard} padded={false}>
                  <TouchableOpacity
                    style={styles.taskRow}
                    onPress={() =>
                      toggleComplete(task._id, !!task.dateCompleted)
                    }
                  >
                    <Ionicons
                      name={
                        task.dateCompleted
                          ? "checkbox"
                          : "square-outline"
                      }
                      size={22}
                      color={
                        task.dateCompleted
                          ? Colors.success
                          : Colors.textTertiary
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
                      {task.timeEstimatedInSecondsUnallocated > 0 && (
                        <Text style={styles.taskMeta}>
                          Est: {formatSecondsAsHM(task.timeEstimatedInSecondsUnallocated)}
                        </Text>
                      )}
                    </View>
                    {timer.isRunning && timer.taskId === task._id && (
                      <View style={styles.timerBadge}>
                        <Ionicons
                          name="timer"
                          size={14}
                          color={Colors.error}
                        />
                      </View>
                    )}
                  </TouchableOpacity>
                </Card>
              ))}
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 500);
              }}
            />
          }
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddTask(true)}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { color: Colors.textSecondary, fontSize: 16 },
  weekNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  weekLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.text,
  },
  listContent: { padding: 16, paddingBottom: 80 },
  group: { marginBottom: 20 },
  groupLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  overdueLabel: { color: Colors.error },
  taskCount: { fontWeight: "400" },
  taskCard: { marginBottom: 6 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  taskContent: { flex: 1 },
  taskName: { fontSize: 15, color: Colors.text, fontWeight: "500" },
  completedTask: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  taskMeta: { fontSize: 12, color: Colors.textTertiary, marginTop: 2 },
  timerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.error + "20",
    alignItems: "center",
    justifyContent: "center",
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
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.2)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
    }),
  },
});
