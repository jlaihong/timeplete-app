import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";

interface EventDialogProps {
  day: string;
  onClose: () => void;
  existingEvent?: {
    _id: string;
    title?: string;
    startTimeHHMM: string;
    durationSeconds: number;
    activityType: string;
    budgetType: string;
    comments?: string;
  };
}

export function EventDialog({ day, onClose, existingEvent }: EventDialogProps) {
  const [title, setTitle] = useState(existingEvent?.title ?? "");
  const [startTime, setStartTime] = useState(
    existingEvent?.startTimeHHMM ?? "09:00"
  );
  const [durationMinutes, setDurationMinutes] = useState(
    existingEvent
      ? String(Math.round(existingEvent.durationSeconds / 60))
      : "60"
  );
  const [activityType, setActivityType] = useState<
    "TASK" | "EVENT" | "TRACKABLE"
  >((existingEvent?.activityType as any) ?? "EVENT");
  const [budgetType, setBudgetType] = useState<"ACTUAL" | "BUDGETED">(
    (existingEvent?.budgetType as any) ?? "ACTUAL"
  );
  const [comments, setComments] = useState(existingEvent?.comments ?? "");
  const [loading, setLoading] = useState(false);

  const upsertTimeWindow = useMutation(api.timeWindows.upsert);

  const handleSave = async () => {
    setLoading(true);
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await upsertTimeWindow({
        id: existingEvent?._id as any,
        startTimeHHMM: startTime,
        startDayYYYYMMDD: day,
        durationSeconds: parseInt(durationMinutes) * 60,
        budgetType,
        activityType,
        title: title || undefined,
        comments: comments || undefined,
        timeZone: tz,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Card style={styles.dialog}>
        <ScrollView>
          <Text style={styles.title}>
            {existingEvent ? "Edit Event" : "New Event"}
          </Text>

          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Event title (optional)"
          />

          <Input
            label="Start Time (HH:MM)"
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
          />

          <Input
            label="Duration (minutes)"
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            keyboardType="numeric"
            placeholder="60"
          />

          <Text style={styles.fieldLabel}>Activity Type</Text>
          <View style={styles.optionRow}>
            {(["EVENT", "TASK", "TRACKABLE"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.option,
                  activityType === t && styles.optionSelected,
                ]}
                onPress={() => setActivityType(t)}
              >
                <Text
                  style={[
                    styles.optionText,
                    activityType === t && styles.optionTextSelected,
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.fieldLabel}>Budget Type</Text>
          <View style={styles.optionRow}>
            {(["ACTUAL", "BUDGETED"] as const).map((b) => (
              <TouchableOpacity
                key={b}
                style={[
                  styles.option,
                  budgetType === b && styles.optionSelected,
                ]}
                onPress={() => setBudgetType(b)}
              >
                <Text
                  style={[
                    styles.optionText,
                    budgetType === b && styles.optionTextSelected,
                  ]}
                >
                  {b}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Input
            label="Comments"
            value={comments}
            onChangeText={setComments}
            placeholder="Optional comments"
            multiline
          />

          <View style={styles.actions}>
            <Button title="Cancel" variant="outline" onPress={onClose} />
            <Button title="Save" onPress={handleSave} loading={loading} />
          </View>
        </ScrollView>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: { width: "100%", maxWidth: 420, maxHeight: "80%" },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  option: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },
  optionText: { fontSize: 12, fontWeight: "500", color: Colors.textSecondary },
  optionTextSelected: { color: Colors.primary },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 8,
  },
});
