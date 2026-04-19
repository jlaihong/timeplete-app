import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Card } from "../../ui/Card";
import { Colors } from "../../../constants/colors";
import type { TrackableSeriesGoal } from "./types";

interface AnalyticsTrackableCardProps {
  goal: TrackableSeriesGoal;
  children: React.ReactNode;
}

/* ──────────────────────────────────────────────────────────────────── *
 * AnalyticsTrackableCard — read-only card chrome used by every
 * analytics-page trackable widget.
 *
 * Mirrors productivity-one's analytics widget header: colour-tinted
 * icon (`gps_fixed` for goals, `track_changes` for trackers) + name +
 * single `open_in_new` action that routes to the trackable detail
 * screen. Crucially:
 *
 *   - NO context menu (analytics is diagnostic, not destructive)
 *   - NO timer pill (no quick-log on analytics)
 *   - NO "Add progress" button (analytics is read-only)
 *
 * The body is a plain `<View>` (not a Pressable) — analytics widgets
 * never respond to body taps; only the header `open_in_new` opens a
 * detail dialog.
 * ──────────────────────────────────────────────────────────────────── */
export function AnalyticsTrackableCard({
  goal,
  children,
}: AnalyticsTrackableCardProps) {
  const isTracker = goal.trackableType === "TRACKER";
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Ionicons
          name={isTracker ? "analytics" : "locate"}
          size={16}
          color={goal.colour}
          style={{ marginRight: 6 }}
        />
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {goal.name}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.push(`/(app)/edit-trackable/${goal._id}`)}
          accessibilityLabel={`Open details for ${goal.name}`}
        >
          <Ionicons
            name="open-outline"
            size={16}
            color={Colors.textSecondary}
          />
        </TouchableOpacity>
      </View>
      <View style={styles.body}>{children}</View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 12, padding: 12 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    ...Platform.select({
      web: { userSelect: "none" } as any,
      default: {},
    }),
  },
  titleBlock: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: Colors.text },
  headerBtn: { padding: 4 },
  body: { gap: 8 },
});
