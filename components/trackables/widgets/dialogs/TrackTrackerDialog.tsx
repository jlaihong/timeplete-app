import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
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
 *   - `trackTime` → start time + duration `HH:MM` (optional unless duration entered)
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
  const [count, setCount] = useState<number | null>(
    isRatingTracker ? null : 1
  );
  const [startTime, setStartTime] = useState(defaultStartTime());
  const [durationHhmm, setDurationHhmm] = useState("");
  const [comments, setComments] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const upsertEntry = useMutation(api.trackerEntries.upsert);

  const onSave = async () => {
    setError(null);

    if (isRatingTracker && (count == null || count <= 0)) {
      return setError("Please pick a rating from 1 – 10");
    }

    const hasCount = trackCount && count != null && count > 0;
    const hasDuration = trackTime && !!durationHhmm;

    if (!hasCount && !hasDuration) {
      return setError("Enter at least a count or a duration");
    }

    let durationSeconds: number | undefined;
    if (hasDuration) {
      durationSeconds = hhmmToSeconds(durationHhmm);
      if (!isFinite(durationSeconds) || durationSeconds <= 0) {
        return setError("Duration must be greater than zero");
      }
      if (!startTime) return setError("Start time is required when logging time");
    }

    setSaving(true);
    try {
      await upsertEntry({
        trackableId,
        dayYYYYMMDD,
        countValue: trackCount ? count ?? undefined : undefined,
        durationSeconds: trackTime ? durationSeconds : undefined,
        startTimeHHMM: trackTime ? startTime || undefined : undefined,
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
    <Pressable style={styles.overlay} onPress={onClose}>
      <Pressable
        onPress={(e) => e.stopPropagation?.()}
        style={[
          styles.dialogWrap,
          isRatingTracker ? styles.dialogWrapWide : null,
        ]}
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
            {formatYYYYMMDDtoDDMMM(dayYYYYMMDD)}
          </Text>

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
                  <Ionicons name="add" size={22} color={Colors.text} />
                </TouchableOpacity>
              </View>
            </>
          )}

          {trackTime && (
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
              </View>
            </View>
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
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
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
  dialogWrapWide: { maxWidth: 600 },
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
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
});
