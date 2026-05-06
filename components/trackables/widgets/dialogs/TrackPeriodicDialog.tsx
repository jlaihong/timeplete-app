import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
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
import { useAuth } from "../../../../hooks/useAuth";

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
  const [isCompleted, setIsCompleted] = useState(initialNumCompleted > 0);
  const [comments, setComments] = useState(initialComments);
  const [saving, setSaving] = useState(false);
  const upsertDay = useMutation(api.trackableDays.upsert);
  const completedTaskNames = useQuery(
    api.trackables.getCompletedTaskNamesForDay,
    profileReady ? { trackableId, dayYYYYMMDD } : "skip",
  );

  const onSave = async () => {
    setSaving(true);
    try {
      await upsertDay({
        trackableId,
        dayYYYYMMDD,
        numCompleted: isCompleted ? 1 : 0,
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
            {formatYYYYMMDDtoDDMMM(dayYYYYMMDD)}
          </Text>

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
                Tasks completed today
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
    // The dialog is mounted at `DesktopHome` root (a viewport-sized View)
    // on desktop, so `absolute` already covers the viewport. `fixed` on web
    // is belt-and-braces in case the host gets nested under a column later.
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
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
  },
});
