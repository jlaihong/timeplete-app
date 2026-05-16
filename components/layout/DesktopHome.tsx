import React, { useEffect, useState } from "react";
import { todayYYYYMMDD } from "../../lib/dates";
import { View, StyleSheet, ActivityIndicator } from "react-native";
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

/**
 * Render the three-column layout shell first (cheap empty Views), then mount
 * the data-heavy children one frame later. This lets the navigation commit
 * paint the page chrome inside the same frame as the click instead of being
 * blocked by Convex-heavy `useQuery` trees in `TrackableList`,
 * `DesktopTaskList`, and `CalendarView`. The browser shows "you're on home"
 * immediately; data loads and fills in within a frame.
 */
function HomeColumnsGate({
  homeCalendarDay,
  setHomeCalendarDay,
  setShowAddTask,
  setAddTaskDay,
  setSelectedTaskId,
  setEventDialog,
  setShowAddTrackable,
  setLogRequest,
  setEditingTrackableId,
}: {
  homeCalendarDay: string;
  setHomeCalendarDay: (day: string) => void;
  setShowAddTask: (b: boolean) => void;
  setAddTaskDay: (day: string | undefined) => void;
  setSelectedTaskId: (id: Id<"tasks"> | null) => void;
  setEventDialog: (s: DialogState) => void;
  setShowAddTrackable: (b: boolean) => void;
  setLogRequest: (r: LogRequest | null) => void;
  setEditingTrackableId: (id: Id<"trackables"> | null) => void;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  if (!ready) {
    return (
      <View style={styles.columns}>
        <View style={[styles.sideColumn, styles.skeletonColumn]}>
          <ActivityIndicator color={Colors.primary} />
        </View>
        <View style={[styles.centerColumn, styles.skeletonColumn]}>
          <ActivityIndicator color={Colors.primary} />
        </View>
        <View style={[styles.sideColumn, styles.skeletonColumn]}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.columns}>
      <View style={styles.sideColumn}>
        <TrackableList
          title="Trackables"
          showArchivedToggle={false}
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
          rangeStartYYYYMMDD={homeCalendarDay}
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
          onSelectedDayChange={setHomeCalendarDay}
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
  );
}

export function DesktopHome() {
  const [homeCalendarDay, setHomeCalendarDay] = useState(() =>
    todayYYYYMMDD(),
  );
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
        <HomeColumnsGate
          homeCalendarDay={homeCalendarDay}
          setHomeCalendarDay={setHomeCalendarDay}
          setShowAddTask={setShowAddTask}
          setAddTaskDay={setAddTaskDay}
          setSelectedTaskId={setSelectedTaskId}
          setEventDialog={setEventDialog}
          setShowAddTrackable={setShowAddTrackable}
          setLogRequest={setLogRequest}
          setEditingTrackableId={setEditingTrackableId}
        />
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
  // Used only for the one-frame skeleton state of `HomeColumnsGate`. Keeps
  // each column's flex weight so the page chrome's layout doesn't jump when
  // the real content swaps in.
  skeletonColumn: { alignItems: "center", justifyContent: "center" },
});
