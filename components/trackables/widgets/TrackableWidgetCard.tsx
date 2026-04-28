import React from "react";
import { View, Text, StyleSheet, Pressable, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Card } from "../../ui/Card";
import { Colors } from "../../../constants/colors";
import {
  daysBetweenYYYYMMDD,
  todayYYYYMMDD,
} from "../../../lib/dates";
import { useTimer } from "../../../hooks/useTimer";
import type { WidgetGoal } from "./types";

interface TrackableWidgetCardProps {
  goal: WidgetGoal;
  children: React.ReactNode;
  onRequestEditTrackable?: (trackableId: string) => void;
}

/**
 * Shared `mat-card` shell for every trackable widget.
 *
 * Mirrors productivity-one's `goal-widget` chrome:
 *   - Colour-tinted "target" icon + name in the header
 *   - Days remaining / overdue copy (suppressed for `TRACKER`)
 *   - Tap the title block or the top-right expand icon to open edit (route or
 *     desktop `EditTrackableDialog` when `onRequestEditTrackable` is passed)
 *   - A live border highlight when this trackable's timer is ticking
 *     (handled inside `WidgetTimerRow`, not here, to avoid an extra hook).
 */
export function TrackableWidgetCard({
  goal,
  children,
  onRequestEditTrackable,
}: TrackableWidgetCardProps) {
  const timer = useTimer();
  const isTicking = timer.isRunning && timer.trackableId === goal._id;

  const showDueCopy = goal.trackableType !== "TRACKER";
  const dueCopy = showDueCopy ? formatDueCopy(goal.endDayYYYYMMDD) : null;

  const openEdit = () => {
    if (onRequestEditTrackable) {
      onRequestEditTrackable(goal._id);
      return;
    }
    router.push(`/(app)/edit-trackable/${goal._id}`);
  };

  return (
    <Card style={[styles.card, isTicking && styles.cardTicking]}>
      <View style={styles.header}>
        <Ionicons
          name="locate"
          size={18}
          color={goal.colour}
          style={{ marginRight: 6 }}
        />
        <Pressable
          style={styles.titleBlock}
          onPress={openEdit}
          accessibilityRole="button"
          accessibilityLabel="Open trackable details"
        >
          <Text style={styles.title}>{goal.name}</Text>
          {dueCopy && (
            <Text
              style={[
                styles.dueCopy,
                dueCopy.tone === "overdue" && styles.dueCopyOverdue,
                dueCopy.tone === "due-today" && styles.dueCopyDueToday,
              ]}
            >
              {dueCopy.label}
            </Text>
          )}
        </Pressable>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={openEdit}
          accessibilityLabel="Expand trackable details"
        >
          <Ionicons
            name="open-outline"
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.body}>{children}</View>
    </Card>
  );
}

interface DueCopy {
  label: string;
  tone: "default" | "due-today" | "overdue";
}

function formatDueCopy(endDayYYYYMMDD: string): DueCopy | null {
  if (!endDayYYYYMMDD) return null;
  const today = todayYYYYMMDD();
  const days = daysBetweenYYYYMMDD(today, endDayYYYYMMDD);
  if (days < 0) {
    const overdue = -days;
    return {
      label: overdue === 1 ? "1 day overdue" : `${overdue} days overdue`,
      tone: "overdue",
    };
  }
  if (days === 0) return { label: "Due today", tone: "due-today" };
  if (days === 1) return { label: "1 day left", tone: "default" };
  return { label: `${days} days left`, tone: "default" };
}

const styles = StyleSheet.create({
  card: { marginBottom: 12 },
  cardTicking: {
    // Mirror productivity-one's `goal-widget--ticking` 2px green border.
    borderWidth: 2,
    borderColor: Colors.success,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  titleBlock: { flex: 1, flexDirection: "column", alignItems: "center" },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  dueCopy: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 1,
    textAlign: "center",
  },
  dueCopyDueToday: { color: Colors.warning },
  dueCopyOverdue: { color: Colors.error },
  headerBtn: { padding: 4, marginLeft: 4 },
  body: { gap: 10, alignItems: "center" },
});
