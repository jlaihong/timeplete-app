import React, { useEffect, useState } from "react";
import { todayYYYYMMDD } from "../../lib/dates";
import { View, StyleSheet, Pressable, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SkeletonRows } from "../ui/SkeletonRows";
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
const TRACKABLES_COLLAPSED_KEY = "home.trackablesCollapsed";
/** Window width under which the trackables rail narrows. */
const COMPACT_BELOW = 1280;
/** Window width under which the trackables rail starts folded away. */
const AUTO_COLLAPSE_BELOW = 1280;

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
  trackablesCollapsed,
  setTrackablesCollapsed,
  compact,
}: {
  /** Narrow window: the trackables rail takes less room. */
  compact: boolean;
  trackablesCollapsed: boolean;
  setTrackablesCollapsed: (collapsed: boolean) => void;
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
        {trackablesCollapsed ? (
          <View style={styles.collapsedRail} />
        ) : (
          <View
            style={[
              styles.trackablesColumn,
              compact && styles.trackablesColumnCompact,
            ]}
          >
            <SkeletonRows count={4} rowHeight={120} />
          </View>
        )}
        <View style={styles.centerColumn}>
          <SkeletonRows count={8} />
        </View>
        <View style={styles.sideColumn}>
          <SkeletonRows count={6} rowHeight={64} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.columns}>
      {trackablesCollapsed ? (
        <View style={styles.collapsedRail}>
          <Pressable
            onPress={() => setTrackablesCollapsed(false)}
            style={styles.railToggle}
            accessibilityRole="button"
            accessibilityLabel="Show trackables"
            hitSlop={8}
          >
            <Ionicons
              name="chevron-forward"
              size={18}
              color={Colors.textSecondary}
            />
          </Pressable>
        </View>
      ) : (
        <View
          style={[
            styles.trackablesColumn,
            compact && styles.trackablesColumnCompact,
          ]}
        >
          <TrackableList
            title="Trackables"
            showArchivedToggle={false}
            homeOnly
            onRequestAddTrackable={() => setShowAddTrackable(true)}
            onRequestLog={setLogRequest}
            onRequestEditTrackable={(id) =>
              setEditingTrackableId(id as Id<"trackables">)
            }
          />
          <Pressable
            onPress={() => setTrackablesCollapsed(true)}
            style={[styles.railToggle, styles.railToggleFloating]}
            accessibilityRole="button"
            accessibilityLabel="Hide trackables"
            hitSlop={8}
          >
            <Ionicons
              name="chevron-back"
              size={18}
              color={Colors.textSecondary}
            />
          </Pressable>
        </View>
      )}

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

  // Tasks are the primary job of this screen; the trackables rail can be
  // folded away. The choice is remembered per device.
  // Until the user picks, it follows the window: folded when the window
  // is too narrow to give tasks and the calendar a usable width.
  const { width: windowWidth } = useWindowDimensions();
  const compact = windowWidth < COMPACT_BELOW;
  const [trackablesChoice, setTrackablesCollapsedState] = useState<
    boolean | null
  >(null);
  const trackablesCollapsed =
    trackablesChoice ?? windowWidth < AUTO_COLLAPSE_BELOW;
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(TRACKABLES_COLLAPSED_KEY)
      .then((stored) => {
        if (cancelled) return;
        if (stored === "1") setTrackablesCollapsedState(true);
        else if (stored === "0") setTrackablesCollapsedState(false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const setTrackablesCollapsed = (collapsed: boolean) => {
    setTrackablesCollapsedState(collapsed);
    AsyncStorage.setItem(TRACKABLES_COLLAPSED_KEY, collapsed ? "1" : "0").catch(
      () => {},
    );
  };

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
          trackablesCollapsed={trackablesCollapsed}
          setTrackablesCollapsed={setTrackablesCollapsed}
          compact={compact}
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
  // Centred so that on a very wide window the leftover space is split
  // either side instead of piling up on the right.
  columns: { flex: 1, flexDirection: "row", justifyContent: "center" },
  // Spacing between sections — replaces the previous 1px vertical dividers.
  // Background is uniform across all columns so the page reads as one surface.
  //
  // Widths: the trackables rail is a fixed width (its cards have one good
  // size); tasks and the calendar share the rest, each capped so a wide
  // window doesn't stretch a task's title away from its labels.
  sideColumn: { flex: 1, maxWidth: 480, minHeight: 0, paddingHorizontal: 8 },
  trackablesColumn: {
    width: 296,
    flexShrink: 0,
    minHeight: 0,
    paddingHorizontal: 8,
  },
  trackablesColumnCompact: { width: 256 },
  centerColumn: { flex: 1.6, maxWidth: 880, minWidth: 0, paddingHorizontal: 8 },
  collapsedRail: { width: 40, alignItems: "center", paddingTop: 12 },
  railToggle: { padding: 6 },
  // Sits beside the column's "+" button in the Trackables header.
  railToggleFloating: { position: "absolute", top: 14, right: 60 },
});
