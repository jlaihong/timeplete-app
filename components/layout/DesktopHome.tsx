import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { DesktopTaskList } from "../tasks/DesktopTaskList";
import { TrackableList } from "../shared/TrackableList";
import { CalendarView } from "../shared/CalendarView";
import { AddTaskSheet } from "../tasks/AddTaskSheet";
import { TaskDetailSheet } from "../tasks/TaskDetailSheet";
import { EventDialog } from "../calendar/EventDialog";
import { AddTrackableFlow } from "../trackables/AddTrackableFlow";
import { TrackableDialogHost } from "../trackables/widgets/TrackableDialogHost";
import type { LogRequest } from "../trackables/widgets/types";
import { todayYYYYMMDD } from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";
import { HomeDndProvider } from "../dnd/HomeDndProvider";

export function DesktopHome() {
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDay, setAddTaskDay] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null
  );
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [eventDay, setEventDay] = useState(todayYYYYMMDD());

  // Trackable dialogs are owned here (rather than inside `TrackableList`) so
  // their overlays cover the full viewport and aren't clipped by the narrow
  // `sideColumn`. See note in `TrackableList.tsx`.
  const [showAddTrackable, setShowAddTrackable] = useState(false);
  const [logRequest, setLogRequest] = useState<LogRequest | null>(null);

  return (
    <View style={styles.container}>
      {/* Single continuous surface — sections are separated by spacing/typography,
          not borders or per-section backgrounds. See Req 1 in HOME-REQUIREMENTS. */}
      {/* HomeDndProvider hosts the single shared dnd-kit context so that
          intra-list reorder (DesktopTaskList) and cross-container drop
          (CalendarView) are unified under one DndContext / DragOverlay. */}
      <HomeDndProvider>
        <View style={styles.columns}>
          <View style={styles.sideColumn}>
            <TrackableList
              title="Trackables"
              onRequestAddTrackable={() => setShowAddTrackable(true)}
              onRequestLog={setLogRequest}
            />
          </View>

          <View style={styles.centerColumn}>
            <DesktopTaskList
              title="Tasks"
              onAddTask={(day) => {
                setAddTaskDay(day);
                setShowAddTask(true);
              }}
              onSelectTask={setSelectedTaskId}
            />
          </View>

          <View style={styles.sideColumn}>
            <CalendarView
              title="Calendar"
              onAddEvent={(day) => {
                setEventDay(day);
                setShowEventDialog(true);
              }}
            />
          </View>
        </View>
      </HomeDndProvider>

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

      {showEventDialog && (
        <EventDialog
          day={eventDay}
          onClose={() => setShowEventDialog(false)}
        />
      )}

      {showAddTrackable && (
        <AddTrackableFlow onClose={() => setShowAddTrackable(false)} />
      )}

      <TrackableDialogHost
        request={logRequest}
        onClose={() => setLogRequest(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  columns: { flex: 1, flexDirection: "row" },
  // Spacing between sections — replaces the previous 1px vertical dividers.
  // Background is uniform across all columns so the page reads as one surface.
  sideColumn: { flex: 1, paddingHorizontal: 8 },
  centerColumn: { flex: 1.5, paddingHorizontal: 8 },
});
