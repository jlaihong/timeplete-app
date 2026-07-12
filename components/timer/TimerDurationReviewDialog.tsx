/**
 * "How long did you actually work?" — shown when a long-running timer is
 * stopped through the check-in flow ("No, I'm not working on this any
 * more") or after the 24h auto-stop parked the period for review.
 *
 * The user confirms the period to log: an editable start (date + 24h
 * time, interpreted in the TIMER's IANA zone so it matches what the
 * calendar will show) and an explicit duration. Nothing is written until
 * Save — cancelling leaves the timer running / the pending review parked.
 */
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/colors";
import {
  assessClockHhMmInput,
  assessDurationHhMmInput,
  hhmmToSeconds,
  secondsToHhmm,
} from "../../lib/dates";
import {
  wallClockGridToEpochMs,
  wallClockInTimeZone,
} from "../../lib/wallClockTimeZone";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import { DateField } from "../ui/DateField";
import { StartTimeComboField } from "../trackables/widgets/dialogs/StartTimeComboField";
import { DurationComboField } from "../trackables/widgets/dialogs/DurationComboField";

interface TimerDurationReviewDialogProps {
  /** Task / trackable display name for the header. */
  title: string;
  /** Explanation line, e.g. why the timer was stopped. */
  subtitle: string;
  /** IANA zone stored on the timer row — start fields are wall clock in this zone. */
  timeZone: string;
  /** Original timer start (epoch ms) used to pre-fill the start fields. */
  initialStartEpochMs: number;
  /** Pre-fill for the duration field; 0 leaves it empty. */
  prefillDurationSeconds: number;
  /** Extra footer button that logs nothing (24h auto-stop reviews). */
  onDiscard?: () => void;
  onCancel: () => void;
  onSubmit: (startEpochMs: number, durationSeconds: number) => Promise<void>;
}

export function TimerDurationReviewDialog({
  title,
  subtitle,
  timeZone,
  initialStartEpochMs,
  prefillDurationSeconds,
  onDiscard,
  onCancel,
  onSubmit,
}: TimerDurationReviewDialogProps) {
  const initialWall = useMemo(
    () => wallClockInTimeZone(initialStartEpochMs, timeZone),
    [initialStartEpochMs, timeZone],
  );
  const [startDay, setStartDay] = useState(initialWall.startDayYYYYMMDD);
  const [startHHMM, setStartHHMM] = useState(initialWall.startTimeHHMM);
  const [duration, setDuration] = useState(
    prefillDurationSeconds > 0 ? secondsToHhmm(prefillDurationSeconds) : "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const durationSeconds = hhmmToSeconds(duration);
  const canSave =
    !saving &&
    startDay.length === 8 &&
    assessClockHhMmInput(startHHMM) === "valid" &&
    assessDurationHhMmInput(duration, false) === "valid" &&
    durationSeconds > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const [h, m] = startHHMM.split(":").map((x) => parseInt(x, 10));
      const startEpochMs = wallClockGridToEpochMs(
        startDay,
        h * 60 + m,
        timeZone,
      );
      await onSubmit(startEpochMs, durationSeconds);
    } catch (err) {
      console.warn("TimerDurationReviewDialog save failed:", err);
      setError("Could not save this time. Please check the values and retry.");
      setSaving(false);
    }
  };

  return (
    <DialogOverlay onBackdropPress={onCancel} zIndex={4000}>
      <DialogCard desktopWidth={440}>
        <DialogHeader title="Log your time" onClose={onCancel} />
        <View style={styles.body}>
          <Text style={styles.taskName} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          <DateField label="Started on" value={startDay} onChange={setStartDay} />
          <View style={styles.fieldGap} />
          <StartTimeComboField
            label="Started at"
            value={startHHMM}
            onChange={setStartHHMM}
          />
          <View style={styles.fieldGap} />
          <DurationComboField
            label="Time worked"
            value={duration}
            onChange={setDuration}
            allowNone={false}
            placeholder="hh:mm"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
        <DialogFooter>
          {onDiscard ? (
            <Button
              title="Log nothing"
              variant="ghost"
              onPress={onDiscard}
              disabled={saving}
              size="small"
            />
          ) : null}
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onCancel}
            disabled={saving}
            size="small"
          />
          <Button
            title="Save"
            onPress={() => void handleSave()}
            disabled={!canSave}
            loading={saving}
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.textSecondary,
    marginBottom: 16,
  },
  fieldGap: {
    height: 12,
  },
  error: {
    fontSize: 13,
    color: Colors.error,
    marginTop: 12,
  },
});
