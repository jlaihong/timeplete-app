import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Card } from "../ui/Card";
import { Colors } from "../../constants/colors";
import { formatSecondsAsHM } from "../../lib/dates";
import { Ionicons } from "@expo/vector-icons";

interface GoalWidgetProps {
  goal: {
    _id: string;
    name: string;
    colour: string;
    trackableType: string;
    totalTimeSeconds: number;
    totalCount: number;
    calendarCount: number;
    targetCount?: number | null;
    targetNumberOfHours?: number | null;
    targetNumberOfDaysAWeek?: number | null;
    targetNumberOfMinutesAWeek?: number | null;
    frequency?: string | null;
  };
  onPress?: () => void;
  onTrack?: () => void;
}

export function GoalWidget({ goal, onPress, onTrack }: GoalWidgetProps) {
  const { currentValue, targetValue, unit } = getProgressInfo(goal);
  const percent = targetValue > 0 ? (currentValue / targetValue) * 100 : 0;

  return (
    <Card style={styles.card}>
      <TouchableOpacity onPress={onPress}>
        <View style={styles.header}>
          <View style={[styles.dot, { backgroundColor: goal.colour }]} />
          <Text style={styles.name} numberOfLines={1}>
            {goal.name}
          </Text>
        </View>

        <View style={styles.stats}>
          <Text style={styles.current}>
            {formatValue(currentValue, goal.trackableType)}
          </Text>
          {targetValue > 0 && (
            <Text style={styles.target}>
              / {formatValue(targetValue, goal.trackableType)} {unit}
            </Text>
          )}
        </View>

        {targetValue > 0 && (
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(percent, 100)}%`,
                  backgroundColor:
                    percent >= 100 ? Colors.success : goal.colour,
                },
              ]}
            />
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.sessions}>
            {goal.calendarCount} sessions
          </Text>
          {goal.frequency && (
            <Text style={styles.frequency}>{goal.frequency}</Text>
          )}
        </View>
      </TouchableOpacity>

      {onTrack && (
        <TouchableOpacity style={styles.trackButton} onPress={onTrack}>
          <Ionicons name="add-circle" size={24} color={goal.colour} />
        </TouchableOpacity>
      )}
    </Card>
  );
}

function getProgressInfo(goal: GoalWidgetProps["goal"]) {
  switch (goal.trackableType) {
    case "NUMBER":
      return {
        currentValue: goal.totalCount,
        targetValue: goal.targetCount ?? 0,
        unit: "",
      };
    case "TIME_TRACK":
      return {
        currentValue: goal.totalTimeSeconds / 3600,
        targetValue: goal.targetNumberOfHours ?? 0,
        unit: "hours",
      };
    case "DAYS_A_WEEK":
      return {
        currentValue: goal.totalCount,
        targetValue: goal.targetNumberOfDaysAWeek ?? 0,
        unit: "days/week",
      };
    case "MINUTES_A_WEEK":
      return {
        currentValue: goal.totalTimeSeconds / 60,
        targetValue: goal.targetNumberOfMinutesAWeek ?? 0,
        unit: "min/week",
      };
    default:
      return { currentValue: goal.totalCount, targetValue: 0, unit: "" };
  }
}

function formatValue(value: number, type: string): string {
  if (type === "TIME_TRACK") return formatSecondsAsHM(value * 3600);
  if (type === "MINUTES_A_WEEK") return formatSecondsAsHM(value * 60);
  return Math.round(value).toString();
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, position: "relative" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  name: { flex: 1, fontSize: 16, fontWeight: "600", color: Colors.text },
  stats: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
    marginBottom: 8,
  },
  current: { fontSize: 24, fontWeight: "700", color: Colors.text },
  target: { fontSize: 14, color: Colors.textSecondary },
  progressBar: {
    height: 4,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 2,
    marginBottom: 8,
  },
  progressFill: { height: 4, borderRadius: 2 },
  footer: { flexDirection: "row", justifyContent: "space-between" },
  sessions: { fontSize: 12, color: Colors.textTertiary },
  frequency: { fontSize: 12, color: Colors.textTertiary },
  trackButton: {
    position: "absolute",
    top: 16,
    right: 16,
  },
});
