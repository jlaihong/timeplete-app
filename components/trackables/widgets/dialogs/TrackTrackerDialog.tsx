import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Colors } from "../../../../constants/colors";
import { Button } from "../../../ui/Button";
import {
  assessClockHhMmInput,
  assessDurationHhMmInput,
  hhmmToSeconds,
  normalizeClockHhMm,
} from "../../../../lib/dates";
import { DateField } from "../../../ui/DateField";
import {
  TrackableLogDurationBlock,
  TrackableLogStartTimeBlock,
} from "./TrackableLogHhMmFields";
import { TrackDialogShell } from "./TrackDialogShell";
import { useDurationDrivenStartTime } from "./useDurationDrivenStartTime";

interface TrackTrackerDialogProps {
  trackableId: Id<"trackables">;
  trackableName: string;
  trackableColour: string;
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
  trackCount: boolean;
  trackTime: boolean;
  isRatingTracker: boolean;
  onClose: () => void;
}

const RATING_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * Mirror of productivity-one's `TrackTrackerDialog`. Conditional fields:
 *   - `isRatingTracker` → 1-10 mood selector (required)
 *   - else `trackCount` → numeric count input (default 1)
 *   - `trackTime` → duration + start time `HH:MM`. Duration is required
 *     for time-only trackers (nothing to log without it) and optional
 *     when a count can carry the entry. Start time defaults to
 *     now − duration until edited.
 *
 * Persists via `trackerEntries.upsert`.
 */
export function TrackTrackerDialog({
  trackableId,
  trackableName,
  trackableColour,
  dayYYYYMMDD,
  trackCount,
  trackTime,
  isRatingTracker,
  onClose,
}: TrackTrackerDialogProps) {
  // The entry's day — starts at the caller-supplied day (usually today)
  // and is editable so progress can be logged for any past day.
  const [day, setDay] = useState(dayYYYYMMDD);
  const [count, setCount] = useState<number | null>(
    isRatingTracker ? null : 1
  );
  // Duration is only optional when a count can carry the entry on its
  // own; for a time-only tracker there is nothing to log without it.
  const durationOptional = trackCount;
  const [durationHhmm, setDurationHhmm] = useState(
    durationOptional ? "" : "0:30"
  );
  // Duration comes first; start time defaults to "ended just now"
  // (now − duration) until the user edits it directly.
  const { startTime, onStartTimeChange } = useDurationDrivenStartTime(
    durationHhmm,
    day,
  );
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const upsertEntry = useMutation(api.trackerEntries.upsert);

  const startStatus = useMemo(
    () => assessClockHhMmInput(startTime),
    [startTime]
  );
  const durationStatus = useMemo(
    () => assessDurationHhMmInput(durationHhmm, durationOptional),
    [durationHhmm, durationOptional]
  );
  const hasValidDuration = trackTime && durationStatus === "valid";
  const durationDirty = trackTime && durationHhmm.trim() !== "";
  const durationIncomplete =
    durationDirty && !hasValidDuration;

  const canSubmit = useMemo(() => {
    if (isRatingTracker && (count == null || count <= 0)) return false;
    if (durationIncomplete) return false;

    const hasCount = trackCount && count != null && count > 0;
    if (!hasCount && !hasValidDuration) return false;
    if (hasValidDuration && startStatus !== "valid") return false;
    return true;
  }, [
    isRatingTracker,
    count,
    durationIncomplete,
    trackCount,
    hasValidDuration,
    startStatus,
  ]);

  const onSave = async () => {
    setError(null);

    if (isRatingTracker && (count == null || count <= 0)) {
      return setError("Please pick a rating from 1 – 10");
    }

    const hasCount = trackCount && count != null && count > 0;

    if (!hasCount && !hasValidDuration) {
      return setError("Enter at least a count or a duration");
    }

    if (durationIncomplete) {
      return setError(
        durationOptional
          ? "Enter a valid duration or choose None."
          : "Enter a valid duration (hours:minutes, e.g. 1:30)."
      );
    }

    let durationSeconds: number | undefined;
    if (hasValidDuration) {
      durationSeconds = hhmmToSeconds(durationHhmm);
      if (!isFinite(durationSeconds) || durationSeconds <= 0) {
        return setError("Duration must be greater than zero");
      }
      if (startStatus !== "valid") {
        return setError("Start time is required when logging time");
      }
    }

    const normalizedStart = normalizeClockHhMm(startTime);
    if (hasValidDuration && !normalizedStart) {
      return setError("Enter a valid start time (24-hour HH:MM).");
    }

    setSaving(true);
    try {
      await upsertEntry({
        trackableId,
        dayYYYYMMDD: day,
        countValue: trackCount ? count ?? undefined : undefined,
        durationSeconds: trackTime ? durationSeconds : undefined,
        startTimeHHMM:
          hasValidDuration && normalizedStart ? normalizedStart : undefined,
        comments: comments || undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TrackDialogShell
      onClose={onClose}
      maxWidth={isRatingTracker ? 600 : 480}
      actions={
        <>
          <Button
            title="Cancel"
            variant="outline"
            onPress={onClose}
            size="small"
          />
          <Button
            title="Save"
            onPress={onSave}
            loading={saving}
            disabled={!canSubmit}
            size="small"
          />
        </>
      }
    >
          <View style={styles.header}>
            <View
              style={[styles.colourDot, { backgroundColor: trackableColour }]}
            />
            <Text style={styles.title} numberOfLines={1}>
              {trackableName}
            </Text>
          </View>
          <View style={styles.dateBlock}>
            <DateField label="Date" value={day} onChange={setDay} />
          </View>

          {trackCount && isRatingTracker && (
            <View style={styles.ratingBlock}>
              <Text style={styles.ratingLabel}>Rate from 1 – 10</Text>
              <View style={styles.ratingRow}>
                {RATING_VALUES.map((r) => {
                  const selected = count === r;
                  return (
                    <TouchableOpacity
                      key={r}
                      style={[
                        styles.ratingBtn,
                        selected && {
                          backgroundColor: trackableColour,
                          borderColor: trackableColour,
                        },
                      ]}
                      onPress={() => setCount(r)}
                    >
                      <Text
                        style={[
                          styles.ratingBtnText,
                          selected && styles.ratingBtnTextSelected,
                        ]}
                      >
                        {r}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {trackCount && !isRatingTracker && (
            <>
              <Text style={styles.fieldLabel}>Count</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setCount((c) => Math.max(0, (c ?? 0) - 1))}
                >
                  <Ionicons name="remove" size={22} color={Colors.text} />
                </TouchableOpacity>
                <TextInput
                  style={styles.countInput}
                  value={String(count ?? 0)}
                  onChangeText={(t) => {
                    const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
                    setCount(isNaN(n) ? 0 : n);
                  }}
                  keyboardType="number-pad"
                  selectTextOnFocus
                />
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setCount((c) => (c ?? 0) + 1)}
                >
                  <Ionicons name="add" size={24} color={Colors.primary} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {trackTime && (
            <>
              <TrackableLogDurationBlock
                value={durationHhmm}
                onChange={setDurationHhmm}
                allowNone={durationOptional}
              />
              <TrackableLogStartTimeBlock
                value={startTime}
                onChange={onStartTimeChange}
              />
            </>
          )}

          <Text style={styles.fieldLabel}>Comments</Text>
          <TextInput
            style={styles.commentInput}
            value={comments}
            onChangeText={(t) => setComments(t.slice(0, 1024))}
            placeholder="Notes for this entry"
            placeholderTextColor={Colors.textTertiary}
            multiline
          />

          {error && <Text style={styles.error}>{error}</Text>}
    </TrackDialogShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  colourDot: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 18, fontWeight: "700", color: Colors.text, flex: 1 },
  dateBlock: {
    marginTop: 10,
    marginBottom: 16,
  },
  ratingBlock: { marginBottom: 16 },
  ratingLabel: {
    fontSize: 14,
    color: Colors.text,
    textAlign: "center",
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  ratingBtn: {
    minWidth: 36,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  ratingBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  ratingBtnTextSelected: {
    color: Colors.onPrimary,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 16,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  countInput: {
    minWidth: 80,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  commentInput: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
    minHeight: 72,
    textAlignVertical: "top",
    marginBottom: 12,
  },
  error: { fontSize: 13, color: Colors.error, marginBottom: 12 },
});
