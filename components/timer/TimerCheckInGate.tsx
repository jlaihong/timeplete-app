/**
 * Long-running-timer check-ins. Mounted ONCE in the (app) layout so the
 * prompts appear over whatever screen the user is on.
 *
 * Behaviour (see convex/timers.ts for the server half):
 *  - While a timer runs, every 2h elapsed boundary (2h, 4h, ... 22h) that
 *    the user hasn't confirmed yet triggers a "still working on this?"
 *    popup. Checked on mount, on app foreground, and on a 30s interval.
 *  - "Yes" acknowledges the checkpoint server-side (`acknowledgedUpToMs`)
 *    so the popup stays away until the NEXT boundary.
 *  - "No" opens the duration review dialog; saving stops the timer and
 *    logs the user-confirmed start + duration. Cancelling keeps the timer
 *    running (and the popup eligible to re-appear).
 *  - At 24h the server cron auto-stops the timer into
 *    `pendingTimerReviews`; when one exists the review dialog is shown
 *    with a "Log nothing" escape hatch.
 */
import React, { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { useAuth } from "../../hooks/useAuth";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import { TimerDurationReviewDialog } from "./TimerDurationReviewDialog";

/** Check-in cadence: prompt at 2h, 4h, ... of elapsed time. */
const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000;
/** How often to re-evaluate while the app is open. */
const POLL_MS = 30_000;

function formatHours(ms: number): string {
  const hours = ms / 3_600_000;
  const rounded = Math.round(hours * 10) / 10;
  const label = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${label} hour${rounded === 1 ? "" : "s"}`;
}

export function TimerCheckInGate() {
  const { profileReady } = useAuth();
  const timer = useQuery(api.timers.get, profileReady ? {} : "skip");
  const pending = useQuery(
    api.timers.getPendingReview,
    profileReady ? {} : "skip",
  );
  const acknowledgeCheckpoint = useMutation(api.timers.acknowledgeCheckpoint);
  const stopWithDuration = useMutation(api.timers.stopWithDuration);
  const resolvePendingReview = useMutation(api.timers.resolvePendingReview);

  /** Elapsed-ms boundary awaiting a Yes/No, or null when nothing is due. */
  const [dueCheckpointMs, setDueCheckpointMs] = useState<number | null>(null);
  /** True while the duration dialog is open for the RUNNING timer ("No" path). */
  const [reviewingRunning, setReviewingRunning] = useState(false);
  /** Pending review the user closed without resolving — hidden until next launch. */
  const [dismissedPendingId, setDismissedPendingId] = useState<string | null>(
    null,
  );

  const startTime = timer?.startTime ?? null;
  const acknowledgedMs = timer?.acknowledgedUpToMs ?? 0;

  useEffect(() => {
    if (startTime == null) {
      setDueCheckpointMs(null);
      setReviewingRunning(false);
      return;
    }
    const check = () => {
      const elapsed = Date.now() - startTime;
      const boundary =
        Math.floor(elapsed / CHECK_IN_INTERVAL_MS) * CHECK_IN_INTERVAL_MS;
      setDueCheckpointMs(
        boundary >= CHECK_IN_INTERVAL_MS && boundary > acknowledgedMs
          ? boundary
          : null,
      );
    };
    check();
    const id = setInterval(check, POLL_MS);
    // Fires on native foreground AND on web tab visibility (RN-web maps
    // AppState onto the Page Visibility API).
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") check();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [startTime, acknowledgedMs]);

  // ── 24h auto-stop review (takes priority: the timer is already gone) ──
  if (pending && pending._id !== dismissedPendingId) {
    return (
      <TimerDurationReviewDialog
        title={pending.displayTitle ?? "Timer"}
        subtitle={
          "This timer ran for 24 hours, so it was stopped automatically " +
          "and nothing was logged yet. Confirm what to log."
        }
        timeZone={pending.timeZone}
        initialStartEpochMs={pending.startTime}
        prefillDurationSeconds={Math.floor(
          (pending.acknowledgedUpToMs ?? 0) / 1000,
        )}
        onDiscard={() => {
          void resolvePendingReview({
            pendingId: pending._id,
            startTimeEpochMs: pending.startTime,
            durationSeconds: 0,
          });
        }}
        onCancel={() => setDismissedPendingId(pending._id)}
        onSubmit={async (startEpochMs, durationSeconds) => {
          await resolvePendingReview({
            pendingId: pending._id,
            startTimeEpochMs: startEpochMs,
            durationSeconds,
          });
        }}
      />
    );
  }

  if (!timer || startTime == null) return null;

  // ── "No" path: confirm the real duration, then stop ──────────────────
  if (reviewingRunning) {
    return (
      <TimerDurationReviewDialog
        title={timer.displayTitle ?? "Timer"}
        subtitle="The timer will stop and this period will be logged."
        timeZone={timer.timeZone}
        initialStartEpochMs={startTime}
        prefillDurationSeconds={Math.floor(acknowledgedMs / 1000)}
        onCancel={() => setReviewingRunning(false)}
        onSubmit={async (startEpochMs, durationSeconds) => {
          await stopWithDuration({
            startTimeEpochMs: startEpochMs,
            durationSeconds,
          });
          setReviewingRunning(false);
        }}
      />
    );
  }

  // ── Check-in popup ────────────────────────────────────────────────────
  if (dueCheckpointMs == null) return null;

  const startedLabel = new Date(startTime).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    // Backdrop taps are ignored on purpose: the user must answer Yes or
    // No — otherwise a stray tap silently suppresses the reminder.
    <DialogOverlay onBackdropPress={() => {}} zIndex={4000}>
      <DialogCard desktopWidth={420}>
        <DialogHeader
          title="Still working on this?"
          onClose={() =>
            void acknowledgeCheckpoint({ checkpointMs: dueCheckpointMs })
          }
        />
        <View style={styles.body}>
          <Text style={styles.taskName} numberOfLines={2}>
            {timer.displayTitle ?? "Timer"}
          </Text>
          <Text style={styles.detail}>
            This timer has been running for {formatHours(dueCheckpointMs)}{" "}
            (started {startedLabel}).
          </Text>
        </View>
        <DialogFooter>
          <Button
            title="No, stop the timer"
            variant="ghost"
            onPress={() => setReviewingRunning(true)}
            size="small"
          />
          <Button
            title="Yes, still working"
            onPress={() =>
              void acknowledgeCheckpoint({ checkpointMs: dueCheckpointMs })
            }
            size="small"
          />
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  taskName: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 6,
  },
  detail: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
});
