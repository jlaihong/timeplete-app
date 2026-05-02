import React, { useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { DesktopTaskList } from "../../components/tasks/DesktopTaskList";
import { TaskList } from "../../components/shared/TaskList";
import { AddTaskSheet } from "../../components/tasks/AddTaskSheet";
import { TaskDetailSheet } from "../../components/tasks/TaskDetailSheet";
import { HomeDndProvider } from "../../components/dnd/HomeDndProvider";
import { EmptyState } from "../../components/ui/EmptyState";
import { Id } from "../../convex/_generated/dataModel";

/**
 * Inbox — default capture list for tasks (productivity-one parity).
 * Uses the system `lists.isInbox` row; tasks are filtered with `tasks.search`.
 */
export default function InboxScreen() {
  const isDesktop = useIsDesktop();
  const inbox = useQuery(api.lists.getInboxList, {});
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDay, setAddTaskDay] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null
  );

  if (inbox === undefined) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Inbox" }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.muted}>Loading Inbox…</Text>
      </View>
    );
  }

  if (inbox === null) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Inbox" }} />
        <EmptyState
          title="No Inbox list"
          message="Your account should include a system Inbox. Try signing out and back in, or contact support."
        />
      </View>
    );
  }

  const listId = inbox._id;

  if (isDesktop) {
    return (
      <HomeDndProvider>
        <View style={styles.fill}>
          <Stack.Screen
            options={{
              title: "Inbox",
              headerStyle: { backgroundColor: Colors.surface },
            }}
          />
          <DesktopTaskList
            title="Inbox"
            listId={listId}
            onAddTask={(day) => {
              setAddTaskDay(day);
              setShowAddTask(true);
            }}
            onSelectTask={setSelectedTaskId}
          />
          {showAddTask && (
            <AddTaskSheet
              day={addTaskDay}
              listId={listId}
              onClose={() => setShowAddTask(false)}
            />
          )}
          {selectedTaskId && (
            <TaskDetailSheet
              taskId={selectedTaskId}
              onClose={() => setSelectedTaskId(null)}
            />
          )}
        </View>
      </HomeDndProvider>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: "Inbox",
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />
      <TaskList
        title="Inbox"
        listId={listId}
        onAddTask={(day) => {
          setAddTaskDay(day);
          setShowAddTask(true);
        }}
        onSelectTask={setSelectedTaskId}
      />
      {showAddTask && (
        <AddTaskSheet
          day={addTaskDay}
          listId={listId}
          onClose={() => setShowAddTask(false)}
        />
      )}
      {selectedTaskId && (
        <TaskDetailSheet
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    padding: 24,
    gap: 12,
  },
  muted: { fontSize: 14, color: Colors.textSecondary },
});
