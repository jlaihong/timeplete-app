/**
 * THE single source of truth for editing a task's time-spent value.
 *
 * Every task surface (mobile home `TaskList`, mobile list detail page,
 * web `DesktopTaskList`, web list detail) must go through this hook so
 * the mutation call, the optimistic cache patch, and the edit dialog
 * behave identically everywhere. Do NOT wire `api.tasks.setTimeSpent`
 * directly from a screen — that's how the home page and the list pages
 * drifted apart in the past.
 *
 * PERFORMANCE: the "which task is being edited" state lives inside a
 * small host component (`TimeSpentEditorHost`) controlled through a
 * ref, NOT inside the calling screen. If the hook held that state
 * itself, every open/close would re-render the whole screen — on a
 * list with hundreds of task rows that made the dialog visibly lag
 * both opening and closing. With the host, open/close re-renders only
 * the host itself.
 *
 * Usage:
 *   const { openTimeSpentEditor, saveTimeSpent, timeSpentDialog } =
 *     useTaskTimeSpentEditor();
 *   // Native rows: openTimeSpentEditor({ id, name, seconds })
 *   // Web rows (DurationPickerDesktop): onDurationChanged={(s) => void saveTimeSpent(id, s)}
 *   // Render `timeSpentDialog` once at the end of the screen.
 */
import React, {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { applySetTimeSpentOptimisticUpdate } from "../../lib/setTimeSpentOptimisticUpdate";
import { calendarGridIANAZoneForManualEvents } from "../../lib/calendarGridTimeZone";
import { useTimer } from "../../hooks/useTimer";
import { EditTimeSpentDialog } from "./EditTimeSpentDialog";

export interface TimeSpentEditTarget {
  id: Id<"tasks">;
  name: string;
  seconds: number;
}

interface TimeSpentEditorHostHandle {
  open: (target: TimeSpentEditTarget) => void;
  close: () => void;
}

/**
 * Owns the open/closed dialog state so toggling it re-renders ONLY this
 * component, not the (potentially huge) screen that mounted it.
 */
const TimeSpentEditorHost = forwardRef<
  TimeSpentEditorHostHandle,
  { onSave: (taskId: Id<"tasks">, newSeconds: number) => Promise<void> }
>(function TimeSpentEditorHost({ onSave }, ref) {
  const [editing, setEditing] = useState<TimeSpentEditTarget | null>(null);

  useImperativeHandle(
    ref,
    () => ({
      open: (target) => setEditing(target),
      close: () => setEditing(null),
    }),
    [],
  );

  if (!editing) return null;
  return (
    <EditTimeSpentDialog
      taskName={editing.name}
      initialSeconds={editing.seconds}
      onClose={() => setEditing(null)}
      onSave={(secs) => onSave(editing.id, secs)}
    />
  );
});

export function useTaskTimeSpentEditor() {
  const timer = useTimer();

  /**
   * The optimistic patch materializes time gains as a synthetic calendar
   * slice; its wall-clock fields must be computed in the same zone the
   * calendar grid uses or the slice visibly jumps when the server value
   * replaces it. Kept in a ref so the mutation's optimistic closure always
   * reads the current zone without re-creating the mutation.
   */
  const clientCalendarIANAZone = useMemo(
    () =>
      calendarGridIANAZoneForManualEvents({
        isTimerRunning: timer.isRunning,
        canonicalTimerIANAZone: timer.canonicalTimeZone,
      }),
    [timer.isRunning, timer.canonicalTimeZone],
  );
  const optimisticGridTzRef = useRef(clientCalendarIANAZone);
  optimisticGridTzRef.current = clientCalendarIANAZone;

  const baseSetTimeSpent = useMutation(api.tasks.setTimeSpent);
  // Memoized so `saveTimeSpent` keeps a stable identity across renders —
  // safe because the optimistic closure reads the zone through a ref.
  const setTimeSpentMutation = useMemo(
    () =>
      baseSetTimeSpent.withOptimisticUpdate((localStore, args) => {
        applySetTimeSpentOptimisticUpdate(localStore, {
          taskId: args.taskId,
          timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated,
          optimisticGridIANAZone: optimisticGridTzRef.current,
        });
      }),
    [baseSetTimeSpent],
  );

  const saveTimeSpent = useCallback(
    async (taskId: Id<"tasks">, newSeconds: number) => {
      await setTimeSpentMutation({
        taskId,
        timeSpentInSecondsUnallocated: Math.max(0, Math.floor(newSeconds)),
        // Must mirror the optimistic update so the wall-clock slice the
        // server inserts lines up byte-for-byte with what the cache
        // already shows.
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    [setTimeSpentMutation],
  );

  const hostRef = useRef<TimeSpentEditorHostHandle>(null);

  const openTimeSpentEditor = useCallback((target: TimeSpentEditTarget) => {
    hostRef.current?.open(target);
  }, []);

  const closeTimeSpentEditor = useCallback(() => {
    hostRef.current?.close();
  }, []);

  const timeSpentDialog = (
    <TimeSpentEditorHost ref={hostRef} onSave={saveTimeSpent} />
  );

  return {
    openTimeSpentEditor,
    closeTimeSpentEditor,
    saveTimeSpent,
    timeSpentDialog,
  };
}
