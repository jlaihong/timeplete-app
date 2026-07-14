import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Colors } from "../../../../constants/colors";
import { Button } from "../../../ui/Button";
import { DateField } from "../../../ui/DateField";
import { useAuth } from "../../../../hooks/useAuth";
import { TrackDialogShell } from "./TrackDialogShell";

interface TrackPeriodicDialogProps {
  trackableId: Id<"trackables">;
  trackableName: string;
  trackableColour: string;
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
  initialNumCompleted: number;
  initialComments: string;
  onClose: () => void;
}

/**
 * Mirror of productivity-one's `TrackPeriodicGoal` dialog — a single
 * checkbox "Completed for this day" plus a comments field, persisted via
 * `trackableDays.upsert`. Used by `DAYS_A_WEEK` widgets (and Reading in
 * productivity-one).
 */
export function TrackPeriodicDialog({
  trackableId,
  trackableName,
  trackableColour,
  dayYYYYMMDD,
  initialNumCompleted,
  initialComments,
  onClose,
}: TrackPeriodicDialogProps) {
  const { profileReady } = useAuth();
  // The log's day — starts at the caller-supplied day (usually today)
  // and is editable so progress can be logged for any past day.
  const [day, setDay] = useState(dayYYYYMMDD);
  const [isCompleted, setIsCompleted] = useState(initialNumCompleted > 0);
  const [comments, setComments] = useState(initialComments);
  const [saving, setSaving] = useState(false);
  const upsertDay = useMutation(api.trackableDays.upsert);
  const completedTaskNames = useQuery(
    api.trackables.getCompletedTaskNamesForDay,
    profileReady ? { trackableId, dayYYYYMMDD: day } : "skip",
  );

  // When the user picks a DIFFERENT day, the caller-supplied initial
  // values no longer apply — load that day's stored row so the checkbox
  // reflects its saved state instead of silently overwriting it.
  const dayRows = useQuery(
    api.trackableDays.search,
    profileReady && day !== dayYYYYMMDD
      ? { trackableIds: [trackableId], startDay: day, endDay: day }
      : "skip",
  );
  const appliedDayRef = useRef(dayYYYYMMDD);
  useEffect(() => {
    if (appliedDayRef.current === day) return;
    if (day === dayYYYYMMDD) {
      // Back to the original day: the props already carry its values.
      setIsCompleted(initialNumCompleted > 0);
      setComments(initialComments);
      appliedDayRef.current = day;
      return;
    }
    if (dayRows === undefined || completedTaskNames === undefined) return;
    const row = dayRows.find(
      (r) => r.dayYYYYMMDD.replace(/\D/g, "").slice(0, 8) === day,
    );
    setIsCompleted(
      (row?.numCompleted ?? 0) + completedTaskNames.length > 0,
    );
    setComments(row?.comments ?? "");
    appliedDayRef.current = day;
  }, [
    day,
    dayYYYYMMDD,
    dayRows,
    completedTaskNames,
    initialNumCompleted,
    initialComments,
  ]);

  const onSave = async () => {
    setSaving(true);
    try {
      await upsertDay({
        trackableId,
        dayYYYYMMDD: day,
        numCompleted: isCompleted ? 1 : 0,
        comments,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <TrackDialogShell
      onClose={onClose}
      maxWidth={420}
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

          <TouchableOpacity
            style={styles.checkboxRow}
            onPress={() => setIsCompleted((v) => !v)}
          >
            <View
              style={[
                styles.checkbox,
                isCompleted && {
                  backgroundColor: trackableColour,
                  borderColor: trackableColour,
                },
              ]}
            >
              {isCompleted && (
                <Ionicons name="checkmark" size={16} color={Colors.onPrimary} />
              )}
            </View>
            <Text style={styles.checkboxLabel}>Completed for this day</Text>
          </TouchableOpacity>

          {completedTaskNames && completedTaskNames.length > 0 && (
            <View style={styles.completedTasksBlock}>
              <Text style={styles.completedTasksLabel}>
                Tasks completed on this day
              </Text>
              {completedTaskNames.map((name, i) => (
                <View key={`${name}-${i}`} style={styles.completedTaskRow}>
                  <Ionicons
                    name="checkmark-circle"
                    size={14}
                    color={trackableColour}
                  />
                  <Text style={styles.completedTaskText} numberOfLines={1}>
                    {name}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.fieldLabel}>Comments</Text>
          <TextInput
            style={styles.commentInput}
            value={comments}
            onChangeText={(t) => setComments(t.slice(0, 1024))}
            placeholder="What did you do?"
            placeholderTextColor={Colors.textTertiary}
            multiline
            numberOfLines={3}
          />

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
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    paddingVertical: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outline,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxLabel: { fontSize: 15, color: Colors.text, flex: 1 },
  completedTasksBlock: {
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  completedTasksLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  completedTaskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 2,
  },
  completedTaskText: { fontSize: 13, color: Colors.text, flex: 1 },
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
    marginBottom: 16,
  },
});
