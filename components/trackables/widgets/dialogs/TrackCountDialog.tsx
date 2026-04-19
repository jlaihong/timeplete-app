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
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { Colors } from "../../../../constants/colors";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import { formatYYYYMMDDtoDDMMM } from "../../../../lib/dates";

interface TrackCountDialogProps {
  trackableId: Id<"trackables">;
  trackableName: string;
  trackableColour: string;
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
  initialCount: number;
  initialComments: string;
  onClose: () => void;
}

/**
 * Mirror of productivity-one's `TrackCountGoal` dialog — a `+ / -` stepper
 * around a numeric input plus comments. Persists via `trackableDays.upsert`
 * with `numCompleted: count`. Used by `NUMBER` (= COUNT) widgets.
 */
export function TrackCountDialog({
  trackableId,
  trackableName,
  trackableColour,
  dayYYYYMMDD,
  initialCount,
  initialComments,
  onClose,
}: TrackCountDialogProps) {
  const [count, setCount] = useState(initialCount);
  const [comments, setComments] = useState(initialComments);
  const [saving, setSaving] = useState(false);
  const upsertDay = useMutation(api.trackableDays.upsert);
  const completedTaskNames = useQuery(
    api.trackables.getCompletedTaskNamesForDay,
    { trackableId, dayYYYYMMDD }
  );
  const taskCount = completedTaskNames?.length ?? 0;

  const onSave = async () => {
    setSaving(true);
    try {
      // Mirror productivity-one's `TrackCountGoal.onSave`: persist only the
      // *manual* count (auto-attributed tasks are tracked separately via
      // task completion + attribution), so we subtract the count of tasks
      // already completed for this day.
      await upsertDay({
        trackableId,
        dayYYYYMMDD,
        numCompleted: Math.max(0, count - taskCount),
        comments,
      });
      onClose();
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
            {formatYYYYMMDDtoDDMMM(dayYYYYMMDD)} — log count
          </Text>

          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setCount((c) => Math.max(0, c - 1))}
              accessibilityLabel="Decrement"
            >
              <Ionicons name="remove" size={22} color={Colors.text} />
            </TouchableOpacity>
            <TextInput
              style={styles.countInput}
              value={String(count)}
              onChangeText={(t) => {
                const n = parseInt(t.replace(/[^0-9]/g, ""), 10);
                setCount(isNaN(n) ? 0 : n);
              }}
              keyboardType="number-pad"
              selectTextOnFocus
            />
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setCount((c) => c + 1)}
              accessibilityLabel="Increment"
            >
              <Ionicons name="add" size={22} color={Colors.text} />
            </TouchableOpacity>
          </View>

          {completedTaskNames && completedTaskNames.length > 0 && (
            <View style={styles.completedTasksBlock}>
              <Text style={styles.completedTasksLabel}>
                {completedTaskNames.length} task
                {completedTaskNames.length === 1 ? "" : "s"} already counted
                today
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
              <Text style={styles.completedTasksHint}>
                The count above adds to these. Saving stores{" "}
                {Math.max(0, count - completedTaskNames.length)} additional.
              </Text>
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
  dialogWrap: { width: "100%", maxWidth: 420, maxHeight: "85%" },
  dialog: { width: "100%", maxHeight: "100%" },
  header: { flexDirection: "row", alignItems: "center", gap: 8 },
  colourDot: { width: 14, height: 14, borderRadius: 7 },
  title: { fontSize: 18, fontWeight: "700", color: Colors.text, flex: 1 },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
    marginBottom: 20,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    marginBottom: 20,
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
  completedTasksHint: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 6,
    fontStyle: "italic",
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
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
});
