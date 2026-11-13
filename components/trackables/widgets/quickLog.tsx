/**
 * One-click logging from a trackable card.
 *
 * Most entries are "today, the usual amount", so the cards log those with a
 * single press — no dialog — and show a short "Undo" message instead of
 * asking for confirmation up front. Anything unusual (another day, a custom
 * amount, a note) still goes through the log dialog, opened from the card's
 * "⋯" button.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { useConvex, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import { AutoDismissToast } from "../../ui/AutoDismissToast";
import { formatYYYYMMDDtoDDMMM, todayYYYYMMDD } from "../../../lib/dates";
import { startTimeEndingNow } from "./dialogs/useDurationDrivenStartTime";
import { stopTrackableDrag } from "./dragSafe";
import type { WidgetGoal } from "./types";

// ─── Toast (module-level, so any card can raise it) ─────────────────────

type QuickLogToast = { key: number; message: string; undo?: () => void };

let toastSeq = 0;
const toastListeners = new Set<(toast: QuickLogToast | null) => void>();

function showQuickLogToast(message: string, undo?: () => void) {
  toastSeq += 1;
  const toast = { key: toastSeq, message, undo };
  toastListeners.forEach((listener) => listener(toast));
}

/**
 * Shows the "Logged · Undo" message. Mounted once per screen, beside the
 * log dialogs (see `TrackableDialogHost`).
 */
export function QuickLogToastHost() {
  const [toast, setToast] = useState<QuickLogToast | null>(null);
  useEffect(() => {
    toastListeners.add(setToast);
    return () => {
      toastListeners.delete(setToast);
    };
  }, []);
  return (
    <AutoDismissToast
      key={toast?.key ?? 0}
      message={toast?.message ?? null}
      onDismiss={() => setToast(null)}
      actionLabel={toast?.undo ? "Undo" : null}
      onAction={toast?.undo}
    />
  );
}

// ─── Actions ────────────────────────────────────────────────────────────

type DayEntry = { dayYYYYMMDD: string; numCompleted: number; comments?: string };

function dayLabel(dayYYYYMMDD: string): string {
  return dayYYYYMMDD === todayYYYYMMDD()
    ? "today"
    : formatYYYYMMDDtoDDMMM(dayYYYYMMDD);
}

/** "15m", "1h", "1h 30m". */
export function formatQuickDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function useQuickLog() {
  const convex = useConvex();
  const upsertDay = useMutation(api.trackableDays.upsert);
  const upsertWindow = useMutation(api.timeWindows.upsert);
  const removeWindow = useMutation(api.timeWindows.remove);
  const upsertEntry = useMutation(api.trackerEntries.upsert);
  const removeEntry = useMutation(api.trackerEntries.remove);

  return useMemo(() => {
    /** Run a log; on failure say so instead of failing silently. */
    const run = async (work: () => Promise<void>) => {
      try {
        await work();
      } catch (e) {
        console.error("[quickLog] failed:", e);
        showQuickLogToast("Couldn't log that. Try again.");
      }
    };

    return {
      /** Days-a-week goal: mark a day done, or clear it. */
      toggleDay: (goal: WidgetGoal, entry: DayEntry) =>
        run(async () => {
          const wasDone = entry.numCompleted > 0;
          const write = (done: boolean) =>
            upsertDay({
              trackableId: goal._id,
              dayYYYYMMDD: entry.dayYYYYMMDD,
              numCompleted: done ? 1 : 0,
              comments: entry.comments ?? "",
            });
          await write(!wasDone);
          const when = dayLabel(entry.dayYYYYMMDD);
          showQuickLogToast(
            wasDone
              ? `${goal.name}: cleared ${when}`
              : `${goal.name}: done ${when}`,
            () => void write(wasDone),
          );
        }),

      /** Count goal: add to today's total. */
      addCount: (goal: WidgetGoal, entry: DayEntry | undefined, delta = 1) =>
        run(async () => {
          const day = entry?.dayYYYYMMDD ?? todayYYYYMMDD();
          // The day's total includes tasks completed toward this goal;
          // only the manual part is stored, so take those out first.
          const taskNames = await convex.query(
            api.trackables.getCompletedTaskNamesForDay,
            { trackableId: goal._id, dayYYYYMMDD: day },
          );
          const manualBefore = Math.max(
            0,
            (entry?.numCompleted ?? 0) - taskNames.length,
          );
          const write = (numCompleted: number) =>
            upsertDay({
              trackableId: goal._id,
              dayYYYYMMDD: day,
              numCompleted,
              comments: entry?.comments ?? "",
            });
          await write(manualBefore + delta);
          showQuickLogToast(`${goal.name}: +${delta}`, () =>
            void write(manualBefore),
          );
        }),

      /** Tracker: one new entry with a count (a rating, or +1). */
      addEntry: (goal: WidgetGoal, countValue: number, isRating: boolean) =>
        run(async () => {
          const id = await upsertEntry({
            trackableId: goal._id,
            dayYYYYMMDD: todayYYYYMMDD(),
            countValue,
          });
          showQuickLogToast(
            isRating
              ? `${goal.name}: rated ${countValue}`
              : `${goal.name}: +${countValue}`,
            () => void removeEntry({ id: id as Id<"trackerEntries"> }),
          );
        }),

      /** Time already spent, ending now. */
      addTime: (goal: WidgetGoal, seconds: number) =>
        run(async () => {
          const day = todayYYYYMMDD();
          const startTimeHHMM = startTimeEndingNow(seconds);
          let undo: () => void;
          if (goal.trackableType === "TRACKER") {
            const id = await upsertEntry({
              trackableId: goal._id,
              dayYYYYMMDD: day,
              durationSeconds: seconds,
              startTimeHHMM,
            });
            undo = () => void removeEntry({ id: id as Id<"trackerEntries"> });
          } else {
            const id = await upsertWindow({
              startTimeHHMM,
              startDayYYYYMMDD: day,
              durationSeconds: seconds,
              budgetType: "ACTUAL",
              activityType: "TRACKABLE",
              trackableId: goal._id,
              title: goal.name,
              timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              source: "manual",
            });
            undo = () => void removeWindow({ id: id as Id<"timeWindows"> });
          }
          showQuickLogToast(
            `${goal.name}: +${formatQuickDuration(seconds)}`,
            undo,
          );
        }),
    };
  }, [convex, upsertDay, upsertWindow, removeWindow, upsertEntry, removeEntry]);
}

// ─── Shared control ─────────────────────────────────────────────────────

/** Small pill button for a one-click log ("+1", "30m", a rating). */
export function QuickChip({
  label,
  onPress,
  accessibilityLabel,
  compact = false,
  wide = false,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel: string;
  /** Narrower, for a row of many (the 1–10 rating). */
  compact?: boolean;
  /** A bigger target, for a card's only button. */
  wide?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      onPointerDown={stopTrackableDrag as never}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={(state) => [
        styles.chip,
        compact && styles.chipCompact,
        wide && styles.chipWide,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.chipHover,
      ]}
    >
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  );
}

/** The presets offered for "time already spent". */
export const QUICK_TIME_SECONDS = [15 * 60, 30 * 60, 60 * 60];

const styles = StyleSheet.create({
  chip: {
    minWidth: 40,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  chipCompact: { flex: 1, minWidth: 0, paddingHorizontal: 0, height: 28 },
  chipWide: { minWidth: 96, height: 32 },
  chipHover: { backgroundColor: Colors.surfaceContainerHighest },
  chipText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.text,
  },
});
