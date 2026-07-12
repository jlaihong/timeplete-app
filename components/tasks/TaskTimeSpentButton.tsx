/**
 * THE tap-to-edit time-spent control shown on native task rows.
 *
 * Every task row (mobile home `TaskList`, mobile list detail page, …)
 * must render this component — not its own `TouchableOpacity` + text —
 * so the tap behavior, live-timer rendering, and typography stay
 * identical across the app. Pairs with `useTaskTimeSpentEditor`: pass
 * that hook's `openTimeSpentEditor` as `onEdit`.
 */
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Colors } from "../../constants/colors";
import type { Id } from "../../convex/_generated/dataModel";
import { formatSecondsAsHM } from "../../lib/dates";
import { LiveElapsedText } from "../timer/LiveElapsedText";
import type { TimeSpentEditTarget } from "./useTaskTimeSpentEditor";

/** Live tick format while a timer runs: `M:SS`, or `H:MM:SS` past an hour. */
function formatTicking(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface TaskTimeSpentButtonProps {
  taskId: Id<"tasks">;
  taskName: string;
  /** Logged seconds for the row (`timeSpentInSecondsUnallocated ?? 0`). */
  seconds: number;
  /** True when the running timer belongs to this task — becomes read-only. */
  isTicking: boolean;
  /** `useTimer().startTime`; only read while `isTicking`. */
  timerStartTime: number | null;
  /** Open the edit dialog — `useTaskTimeSpentEditor().openTimeSpentEditor`. */
  onEdit: (target: TimeSpentEditTarget) => void;
}

export function TaskTimeSpentButton({
  taskId,
  taskName,
  seconds,
  isTicking,
  timerStartTime,
  onEdit,
}: TaskTimeSpentButtonProps) {
  return (
    <TouchableOpacity
      disabled={isTicking}
      onPress={(e) => {
        // Rows wrap this control in their own touchable (open task
        // detail) — don't let the tap bubble up to it.
        e.stopPropagation?.();
        onEdit({ id: taskId, name: taskName, seconds });
      }}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityLabel={`Edit time spent on ${taskName}`}
    >
      {isTicking ? (
        // Leaf owns the 1s tick so parent lists don't re-render every
        // second while a timer runs (see `useTimerElapsed`).
        <LiveElapsedText
          startTime={timerStartTime}
          baseSeconds={seconds}
          format={formatTicking}
          style={[styles.duration, styles.durationActive]}
        />
      ) : (
        <Text style={styles.duration}>{formatSecondsAsHM(seconds)}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  duration: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontVariant: ["tabular-nums"],
    minWidth: 42,
    textAlign: "right",
  },
  durationActive: {
    color: Colors.success,
    fontWeight: "600",
  },
});
