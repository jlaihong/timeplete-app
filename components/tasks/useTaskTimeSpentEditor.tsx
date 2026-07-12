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
 * Usage:
 *   const { openTimeSpentEditor, saveTimeSpent, timeSpentDialog } =
 *     useTaskTimeSpentEditor();
 *   // Native rows: openTimeSpentEditor({ id, name, seconds })
 *   // Web rows (DurationPickerDesktop): onDurationChanged={(s) => void saveTimeSpent(id, s)}
 *   // Render `timeSpentDialog` once at the end of the screen.
 */
import React, { useCallback, useMemo, useRef, useState } from "react";
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

  const setTimeSpentMutation = useMutation(
    api.tasks.setTimeSpent,
  ).withOptimisticUpdate((localStore, args) => {
    applySetTimeSpentOptimisticUpdate(localStore, {
      taskId: args.taskId,
      timeSpentInSecondsUnallocated: args.timeSpentInSecondsUnallocated,
      optimisticGridIANAZone: optimisticGridTzRef.current,
    });
  });

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

  const [editing, setEditing] = useState<TimeSpentEditTarget | null>(null);

  const openTimeSpentEditor = useCallback((target: TimeSpentEditTarget) => {
    setEditing(target);
  }, []);

  const closeTimeSpentEditor = useCallback(() => setEditing(null), []);

  const timeSpentDialog = editing ? (
    <EditTimeSpentDialog
      taskName={editing.name}
      initialSeconds={editing.seconds}
      onClose={closeTimeSpentEditor}
      onSave={(secs) => saveTimeSpent(editing.id, secs)}
    />
  ) : null;

  return {
    openTimeSpentEditor,
    closeTimeSpentEditor,
    saveTimeSpent,
    timeSpentDialog,
  };
}
