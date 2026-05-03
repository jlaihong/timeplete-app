import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { secondsToDurationString } from "../../lib/dates";

/**
 * Productivity-one `goal-time-tracked` — raw time-window rows for this goal.
 * Matches column layout: Date, Start, Comments/Title, Duration, delete.
 */
export function EditTrackableTimeTrackedTab({
  trackableId,
  targetHoursBanner,
}: {
  trackableId: Id<"trackables">;
  /** Productivity-one `TrackTimeDetails`: grey hours line above time rows. */
  targetHoursBanner?: number;
}) {
  const removeTimeWindow = useMutation(api.timeWindows.remove);
  const rows = useQuery(api.timeWindows.search, { trackableId });

  const sorted = useMemo(() => {
    if (!rows) return [];
    return [...rows].sort((a, b) => {
      const d = b.startDayYYYYMMDD.localeCompare(a.startDayYYYYMMDD);
      if (d !== 0) return d;
      return (b.startTimeHHMM || "").localeCompare(a.startTimeHHMM || "");
    });
  }, [rows]);

  const confirmDelete = (rowId: Id<"timeWindows">) => {
    const run = async () => {
      try {
        await removeTimeWindow({ id: rowId });
      } catch (e) {
        console.error(e);
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Remove this time row?")) void run();
      return;
    }
    Alert.alert("Remove time", "Remove this time row?", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void run() },
    ]);
  };

  if (rows === undefined) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (sorted.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No time rows yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {targetHoursBanner != null ? (
        <Text style={styles.hoursMuted}>{`${targetHoursBanner} hours`}</Text>
      ) : null}
      <View style={styles.frame}>
        <View style={[styles.dataRow, styles.headerRow]}>
          <Text style={styles.headCell}>Date</Text>
          <Text style={[styles.headCell, styles.colStart]}>Start</Text>
          <Text style={[styles.headCell, styles.colDesc]}>Comments</Text>
          <Text style={[styles.headCell, styles.colDur]}>Duration</Text>
          <View style={styles.colAct} />
        </View>
        {sorted.map((tw, i) => (
          <View
            key={tw._id}
            style={[styles.dataRow, i % 2 === 1 ? styles.zebra : null]}
          >
            <Text style={styles.cell} numberOfLines={2}>
              {tw.startDayYYYYMMDD}
            </Text>
            <Text style={[styles.cell, styles.colStart]} numberOfLines={1}>
              {tw.startTimeHHMM}
            </Text>
            <Text style={[styles.cell, styles.colDesc]} numberOfLines={3}>
              {"displayTitle" in tw && typeof tw.displayTitle === "string"
                ? tw.displayTitle
                : ""}
            </Text>
            <Text style={[styles.cell, styles.colDur]} numberOfLines={1}>
              {secondsToDurationString(tw.durationSeconds)}
            </Text>
            <View style={styles.colAct}>
              <Pressable
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Delete time row"
                onPress={() => confirmDelete(tw._id)}
              >
                <Ionicons name="trash-outline" size={20} color={Colors.text} />
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary },
  hoursMuted: {
    textAlign: "center",
    marginBottom: 8,
    color: Colors.textSecondary,
    fontSize: 14,
    marginTop: 4,
  },
  frame: {
    marginTop: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
  },
  headerRow: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    minHeight: 40,
  },
  zebra: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  headCell: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cell: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  colStart: {
    flex: 0,
    width: 48,
    minWidth: 48,
    maxWidth: 48,
  },
  colDesc: { flex: 2 },
  colDur: {
    flex: 0,
    width: 64,
    minWidth: 64,
    maxWidth: 72,
    textAlign: "right",
  },
  colAct: {
    width: 36,
    minWidth: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
});
