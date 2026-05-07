import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DesktopHome } from "../../../components/layout/DesktopHome";
import { useRegisterDesktopSubtitle } from "../../../components/layout/DesktopAppChrome";
import { TaskList } from "../../../components/shared/TaskList";
import { AddTaskSheet } from "../../../components/tasks/AddTaskSheet";
import { TaskDetailSheet } from "../../../components/tasks/TaskDetailSheet";
import { todayYYYYMMDD } from "../../../lib/dates";
import { Id } from "../../../convex/_generated/dataModel";

export default function TasksScreen() {
  const isDesktop = useIsDesktop();
  useRegisterDesktopSubtitle("Tasks");

  if (isDesktop) {
    return <DesktopHome />;
  }

  return <MobileTasksScreen />;
}

function MobileTasksScreen() {
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDay, setAddTaskDay] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null
  );

  return (
    <View style={styles.container}>
      <TaskList
        onAddTask={(day) => {
          setAddTaskDay(day);
          setShowAddTask(true);
        }}
        onSelectTask={setSelectedTaskId}
      />

      {showAddTask && (
        <AddTaskSheet
          day={addTaskDay}
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
  container: { flex: 1, backgroundColor: Colors.background },
});
