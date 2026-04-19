import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  Pressable,
  Platform,
  TouchableOpacity,
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
  const [startTime, setStartTime] = useState(defaultStartTime());
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
              style={[styles.colourDot, { backgroundColor: trackableColour }]}
            />
            <Text style={styles.title} numberOfLines={1}>
              {trackableName}
            </Text>
          </View>
          <Text style={styles.subtitle}>
            {formatYYYYMMDDtoDDMMM(dayYYYYMMDD)} — log time
          </Text>

          <View style={styles.row}>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Start time (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={startTime}
                onChangeText={setStartTime}
                placeholder="09:00"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
              />
              <View style={styles.presetWrap}>
                {START_TIME_PRESETS.map((p) => (
                  <Preset
                    key={p}
                    label={p}
                    selected={p === startTime}
                    onPress={() => setStartTime(p)}
                  />
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>Duration (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={durationHhmm}
                onChangeText={setDurationHhmm}
                placeholder="0:30"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
              />
              <View style={styles.presetWrap}>
                {DURATION_PRESETS.map((p) => (
                  <Preset
                    key={p}
                    label={p}
                    selected={p === durationHhmm}
                    onPress={() => setDurationHhmm(p)}
                  />
                ))}
              </View>
            </View>
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

function defaultStartTime(): string {
  const d = new Date();
  // Snap to the nearest previous 15-minute mark — same UX as productivity-one's
  // start-time grid, which only offers HH:00 / HH:15 / HH:30 / HH:45 presets.
  const minutes = Math.floor(d.getMinutes() / 15) * 15;
  return `${String(d.getHours()).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
}

const DURATION_PRESETS = ["0:15", "0:30", "0:45", "1:00", "1:30", "2:00"];

const START_TIME_PRESETS = (() => {
  // Build a 15-min grid from 06:00 to 22:00 (limited to nearby 6 entries
  // around "now" to avoid swamping the dialog).
  const now = new Date();
  const baseMinute = Math.floor(now.getMinutes() / 15) * 15;
  const out: string[] = [];
  for (let i = -1; i < 5; i++) {
    const d = new Date(now);
    d.setMinutes(baseMinute + i * 15, 0, 0);
    out.push(
      `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes()
      ).padStart(2, "0")}`
    );
  }
  return out;
})();

function Preset({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.preset, selected && styles.presetSelected]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.presetText,
          selected && styles.presetTextSelected,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
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
  row: { flexDirection: "row", gap: 12 },
  field: { flex: 1, marginBottom: 16 },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  presetWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 6,
  },
  preset: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  presetSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  presetText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  presetTextSelected: { color: Colors.onPrimary },
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
