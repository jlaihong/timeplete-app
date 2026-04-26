import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { DesktopTaskList } from "../tasks/DesktopTaskList";
import { TrackableList } from "../shared/TrackableList";
import {
  CalendarView,
  type AddEventPrefill,
  type EditEventPayload,
} from "../shared/CalendarView";
import { AddTaskSheet } from "../tasks/AddTaskSheet";
import { TaskDetailSheet } from "../tasks/TaskDetailSheet";
import { EventDialog } from "../calendar/EventDialog";
import { AddTrackableFlow } from "../trackables/AddTrackableFlow";
import { EditTrackableDialog } from "../trackables/EditTrackableDialog";
import { TrackableDialogHost } from "../trackables/widgets/TrackableDialogHost";
import type { LogRequest } from "../trackables/widgets/types";
import { Id } from "../../convex/_generated/dataModel";
import { HomeDndProvider } from "../dnd/HomeDndProvider";

/**
 * Single dialog state — there is one EventDialog instance reused for
 * both create and edit. The `mode` discriminates how it's mounted.
 */
type DialogState =
  | { mode: "create"; day: string; prefill: AddEventPrefill | null }
  | { mode: "edit"; day: string; event: EditEventPayload }
  | null;

export function DesktopHome() {
  const [showAddTask, setShowAddTask] = useState(false);
  const [addTaskDay, setAddTaskDay] = useState<string | undefined>();
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"tasks"> | null>(
    null
  );
  const [eventDialog, setEventDialog] = useState<DialogState>(null);

  // Trackable dialogs are owned here (rather than inside `TrackableList`) so
  // their overlays cover the full viewport and aren't clipped by the narrow
  // `sideColumn`. See note in `TrackableList.tsx`.
  const [showAddTrackable, setShowAddTrackable] = useState(false);
  const [editingTrackableId, setEditingTrackableId] =
    useState<Id<"trackables"> | null>(null);
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
              onRequestEditTrackable={(id) =>
                setEditingTrackableId(id as Id<"trackables">)
              }
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
              onAddEvent={(day, prefill) => {
                setEventDialog({
                  mode: "create",
                  day,
                  prefill: prefill ?? null,
                });
              }}
              onEditEvent={(event) => {
                setEventDialog({
                  mode: "edit",
                  day: event.startDayYYYYMMDD,
                  event,
                });
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

      {eventDialog && (
        <EventDialog
          day={eventDialog.day}
          existingEvent={
            eventDialog.mode === "edit" ? eventDialog.event : undefined
          }
          defaultStartTimeHHMM={
            eventDialog.mode === "create"
              ? eventDialog.prefill?.startTimeHHMM
              : undefined
          }
          defaultDurationMinutes={
            eventDialog.mode === "create"
              ? eventDialog.prefill?.durationMinutes
              : undefined
          }
          onClose={() => setEventDialog(null)}
        />
      )}

      {showAddTrackable && (
        <AddTrackableFlow onClose={() => setShowAddTrackable(false)} />
      )}

      {editingTrackableId && (
        <EditTrackableDialog
          trackableId={editingTrackableId}
          onClose={() => setEditingTrackableId(null)}
        />
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
