import { FontSize, Radius } from "../../../theme/tokens";
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { Card } from "../../ui/Card";
import { Colors } from "../../../constants/colors";
import {
  daysBetweenYYYYMMDD,
  todayYYYYMMDD,
} from "../../../lib/dates";
import { useTimer } from "../../../hooks/useTimer";
import type { WidgetGoal } from "./types";
import { shouldIgnoreTrackablePress } from "./dragSafe";

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
    if (shouldIgnoreTrackablePress()) return;
    if (onRequestEditTrackable) {
      onRequestEditTrackable(goal._id);
      return;
    }
    router.push(`/(app)/edit-trackable/${goal._id}`);
  };

  return (
    <Card style={[styles.card, isTicking && styles.cardTicking]}>
      {/* The whole header opens the trackable; no separate "open" button. */}
      <Pressable
        style={styles.header}
        onPress={openEdit}
        accessibilityRole="button"
        accessibilityLabel={`Open ${goal.name} details`}
      >
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: goal.colour }]} />
          <Text style={styles.title} numberOfLines={2}>
            {goal.name}
          </Text>
        </View>
        {dueCopy && (
          <Text
            style={[
              styles.dueCopy,
              dueCopy.tone === "overdue" && styles.dueCopyOverdue,
              dueCopy.tone === "due-today" && styles.dueCopyDueToday,
            ]}
            numberOfLines={1}
          >
            {dueCopy.label}
          </Text>
        )}
      </Pressable>

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
  // The running trackable gets the accent wash, the same "live" cue the
  // ticking task row uses, instead of a coloured border.
  cardTicking: { backgroundColor: Colors.accentWash },
  header: { marginBottom: 12, gap: 2 },
  titleRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  dueCopy: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    // Lines up under the title, past the 8px dot and its gap.
    marginLeft: 16,
  },
  dueCopyDueToday: { color: Colors.warning },
  dueCopyOverdue: { color: Colors.error },
  body: { gap: 10, alignItems: "stretch" },
});
