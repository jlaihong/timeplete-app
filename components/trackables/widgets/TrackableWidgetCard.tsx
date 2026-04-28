import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "convex/react";
import { router } from "expo-router";
import { api } from "../../../convex/_generated/api";
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
 *   - Top-right "open in new" affordance opening the edit screen
 *   - Right-click / long-press context menu: Archive/Unarchive, Delete
 *   - A live border highlight when this trackable's timer is ticking
 *     (handled inside `WidgetTimerRow`, not here, to avoid an extra hook).
 */
export function TrackableWidgetCard({
  goal,
  children,
  onRequestEditTrackable,
}: TrackableWidgetCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const archiveTrackable = useMutation(api.trackables.archive);
  const removeTrackable = useMutation(api.trackables.remove);
  const timer = useTimer();
  const isTicking = timer.isRunning && timer.trackableId === goal._id;

  const showDueCopy = goal.trackableType !== "TRACKER";
  const dueCopy = showDueCopy ? formatDueCopy(goal.endDayYYYYMMDD) : null;

  const onArchive = () => {
    setMenuOpen(false);
    Alert.alert(
      goal.archived ? "Unarchive Trackable" : "Archive Trackable",
      `${goal.archived ? "Unarchive" : "Archive"} "${goal.name}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: goal.archived ? "Unarchive" : "Archive",
          onPress: () => archiveTrackable({ id: goal._id }),
        },
      ]
    );
  };

  const onDelete = () => {
    setMenuOpen(false);
    Alert.alert(
      "Delete Trackable",
      `Permanently delete "${goal.name}"? This will remove all logged days, entries, and time windows.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => removeTrackable({ id: goal._id }),
        },
      ]
    );
  };

  // We mimic productivity-one's `matContextMenuTriggerFor` (right-click on
  // desktop, long-press on touch) by wrapping the body in a Pressable.
  const onLongPress = () => setMenuOpen(true);
  const onContextMenu =
    Platform.OS === "web"
      ? (e: any) => {
          e.preventDefault();
          setMenuOpen(true);
        }
      : undefined;

  return (
    <Card style={[styles.card, isTicking && styles.cardTicking]}>
      <View style={styles.header}>
        <Ionicons
          name="locate"
          size={18}
          color={goal.colour}
          style={{ marginRight: 6 }}
        />
        <View style={styles.titleBlock}>
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
        </View>

        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            if (onRequestEditTrackable) {
              onRequestEditTrackable(goal._id);
              return;
            }
            router.push(`/(app)/edit-trackable/${goal._id}`);
          }}
          accessibilityLabel="Open trackable details"
        >
          <Ionicons
            name="open-outline"
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => setMenuOpen((v) => !v)}
          accessibilityLabel="More actions"
        >
          <Ionicons
            name="ellipsis-vertical"
            size={18}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>

      <Pressable
        onLongPress={onLongPress}
        // @ts-expect-error - onContextMenu is web-only
        onContextMenu={onContextMenu}
        style={styles.body}
      >
        {children}
      </Pressable>

      {menuOpen && (
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuOpen(false)}
        >
          <Pressable
            style={styles.menu}
            onPress={(e) => e.stopPropagation?.()}
          >
            <TouchableOpacity style={styles.menuItem} onPress={onArchive}>
              <Ionicons
                name={goal.archived ? "archive" : "archive-outline"}
                size={16}
                color={Colors.text}
              />
              <Text style={styles.menuItemText}>
                {goal.archived ? "Unarchive" : "Archive"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={onDelete}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
              <Text style={[styles.menuItemText, { color: Colors.error }]}>
                Delete
              </Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}
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
  menuBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
  },
  menu: {
    position: "absolute",
    top: 44,
    right: 12,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingVertical: 4,
    minWidth: 140,
    ...Platform.select({
      web: { boxShadow: "0 8px 24px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 8,
      },
    }),
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuItemText: { fontSize: 14, color: Colors.text },
});
