import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Colors } from "../../../../constants/colors";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import {
  formatYYYYMMDDtoDDMMM,
  hhmmToSeconds,
} from "../../../../lib/dates";
import {
  defaultStartTimeQuarterHour,
  quarterHourStartTimeOptions,
  TRACKABLE_DURATION_PRESETS,
} from "../../../../lib/trackableLogPresets";
import { CrossPlatformHhMmSelect } from "./CrossPlatformHhMmSelect";

interface TrackTimeDialogProps {
  trackableId: Id<"trackables">;
  trackableName: string;
  trackableColour: string;
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
  onClose: () => void;
}

/**
 * Mirror of productivity-one's `TrackTimeGoal` dialog — manual time entry
 * for `TIME_TRACK` and `MINUTES_A_WEEK` widgets. Inserts an `ACTUAL`
 * `timeWindow` pinned to the trackable, with a user-supplied start time and
 * duration `HH:MM`.
 */
export function TrackTimeDialog({
  trackableId,
  trackableName,
  trackableColour,
  dayYYYYMMDD,
  onClose,
}: TrackTimeDialogProps) {
  const startOptions = useMemo(
    () =>
      quarterHourStartTimeOptions().map((v) => ({ value: v, label: v })),
    []
  );
  const durationOptions = useMemo(
    () =>
      TRACKABLE_DURATION_PRESETS.map((v) => ({ value: v, label: v })),
    []
  );

  const [startTime, setStartTime] = useState(defaultStartTimeQuarterHour);
  const [durationHhmm, setDurationHhmm] = useState("0:30");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const upsertWindow = useMutation(api.timeWindows.upsert);

  const onSave = async () => {
    setError(null);
    if (!startTime) return setError("Start time is required");
    if (!durationHhmm) return setError("Duration is required");
    const seconds = hhmmToSeconds(durationHhmm);
    if (!isFinite(seconds) || seconds <= 0)
      return setError("Duration must be greater than zero");

    setSaving(true);
    try {
      await upsertWindow({
        startTimeHHMM: startTime,
        startDayYYYYMMDD: dayYYYYMMDD,
        durationSeconds: seconds,
        budgetType: "ACTUAL",
        activityType: "TRACKABLE",
        trackableId,
        title: comments || trackableName,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        source: "manual",
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        onPress={(e) => e.stopPropagation?.()}
        style={styles.dialogWrap}
      >
        <Card style={styles.dialog}>
          <ScrollView>
            <View style={styles.header}>
              <View
                style={[
                  styles.colourDot,
                  { backgroundColor: trackableColour },
                ]}
              />
              <Text style={styles.title} numberOfLines={1}>
                {trackableName}
              </Text>
            </View>
            <Text style={styles.subtitle}>
              {formatYYYYMMDDtoDDMMM(dayYYYYMMDD)} — log time
            </Text>

            <View style={styles.row}>
              <CrossPlatformHhMmSelect
                fieldLabel="Start time"
                ariaLabel="Start time"
                value={startTime}
                onChange={setStartTime}
                options={startOptions}
              />
              <CrossPlatformHhMmSelect
                fieldLabel="Duration"
                ariaLabel="Duration"
                value={durationHhmm}
                onChange={setDurationHhmm}
                options={durationOptions}
              />
            </View>

            <Text style={styles.fieldLabel}>Comments</Text>
            <TextInput
              style={styles.commentInput}
              value={comments}
              onChangeText={(t) => setComments(t.slice(0, 1024))}
              placeholder="What did you do?"
              placeholderTextColor={Colors.textTertiary}
              multiline
            />

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.actions}>
              <Button title="Cancel" variant="outline" onPress={onClose} />
              <Button title="Save" onPress={onSave} loading={saving} />
            </View>
          </ScrollView>
        </Card>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    zIndex: 1000,
    ...Platform.select({
      web: { position: "fixed" as any },
      default: {},
    }),
  },
  dialogWrap: { width: "100%", maxWidth: 480, maxHeight: "85%" },
  dialog: { width: "100%", maxHeight: "100%" },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  colourDot: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 18, fontWeight: "700", color: Colors.text, flex: 1 },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
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
  error: {
    fontSize: 13,
    color: Colors.error,
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
});
