import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDDtoDDMMM,
  secondsToDurationString,
  addDays,
  todayYYYYMMDD,
} from "../../lib/dates";
import { labelForEditDialogTimeSource } from "../../lib/editDialogTrackingHistory";
import {
  buildEditDialogMergedHistory,
  type EditDialogMergedHistoryRow,
} from "../../lib/editDialogAttributedHistory";

export type EditDialogTrackableType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

interface EditTrackableHistoryTabProps {
  trackableId: Id<"trackables">;
  trackableType: EditDialogTrackableType;
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  trackTime: boolean;
  trackCount: boolean;
  isRatingTracker: boolean;
}

export function EditTrackableHistoryTab({
  trackableId,
  trackableType,
  startDayYYYYMMDD,
  endDayYYYYMMDD,
  trackTime,
  trackCount,
  isRatingTracker,
}: EditTrackableHistoryTabProps) {
  const needsServerHistory =
    trackableType === "TIME_TRACK" ||
    trackableType === "MINUTES_A_WEEK" ||
    trackableType === "TRACKER";

  const compactGoalRange = useMemo(() => {
    const s = startDayYYYYMMDD.replace(/\D/g, "").slice(0, 8);
    const e = endDayYYYYMMDD.replace(/\D/g, "").slice(0, 8);
    if (s.length === 8 && e.length === 8) return { startDay: s, endDay: e };
    const end = todayYYYYMMDD();
    return { startDay: addDays(end, -7300), endDay: end };
  }, [startDayYYYYMMDD, endDayYYYYMMDD]);

  const wideRange = useMemo(() => {
    const end = todayYYYYMMDD();
    return { startDay: addDays(end, -7300), endDay: end };
  }, []);

  const historyRange =
    trackableType === "TRACKER" ? wideRange : compactGoalRange;

  const needsBreakdownWindows =
    trackableType === "TIME_TRACK" ||
    trackableType === "MINUTES_A_WEEK" ||
    (trackableType === "TRACKER" && trackTime);

  const timeBreakdown = useQuery(
    api.analytics.getTimeBreakdown,
    needsServerHistory && needsBreakdownWindows
      ? {
          startDay: historyRange.startDay,
          endDay: historyRange.endDay,
        }
      : "skip",
  );

  const trackerSearch = useQuery(
    api.trackerEntries.search,
    needsServerHistory && trackableType === "TRACKER"
      ? {
          trackableId,
          startDay: historyRange.startDay,
          endDay: historyRange.endDay,
          limit: 2000,
        }
      : "skip",
  );

  const daysSearch = useQuery(
    api.trackableDays.search,
    trackableType !== "TRACKER" ? { trackableIds: [trackableId] } : "skip",
  );

  const mergedRows = useMemo((): EditDialogMergedHistoryRow[] | undefined => {
    if (!needsServerHistory) return undefined;
    if (needsBreakdownWindows && timeBreakdown === undefined) return undefined;
    if (trackableType === "TRACKER" && trackerSearch === undefined) {
      return undefined;
    }

    return buildEditDialogMergedHistory({
      trackableId: String(trackableId),
      trackableType:
        trackableType as "TIME_TRACK" | "MINUTES_A_WEEK" | "TRACKER",
      trackTime,
      timeBreakdown: needsBreakdownWindows ? timeBreakdown : undefined,
      trackerSearch: trackableType === "TRACKER" ? trackerSearch : undefined,
    });
  }, [
    needsServerHistory,
    needsBreakdownWindows,
    timeBreakdown,
    trackerSearch,
    trackableId,
    trackableType,
    trackTime,
  ]);

  const renderMerged = () => {
    if (!needsServerHistory) return null;
    if (needsBreakdownWindows && timeBreakdown === undefined) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    if (trackableType === "TRACKER" && trackerSearch === undefined) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    if (!mergedRows || mergedRows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No tracking history yet.</Text>
        </View>
      );
    }
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {mergedRows.map((row) => {
          if (row.kind === "time_window") {
            return (
              <View key={`tw-${row._id}`} style={styles.card}>
                <Text style={styles.cardDate}>
                  {formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD)}
                  {row.startTimeHHMM ? ` · ${row.startTimeHHMM}` : ""}
                </Text>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {row.displayTitle}
                </Text>
                <Text style={styles.cardMeta}>
                  <Text style={styles.sourcePill}>
                    {labelForEditDialogTimeSource(row.source)}
                  </Text>
                  {" · "}
                  <Text style={styles.cardEmph}>
                    {secondsToDurationString(row.durationSeconds)}
                  </Text>
                </Text>
                {row.comments?.trim() ? (
                  <Text style={styles.cardComments}>{row.comments.trim()}</Text>
                ) : null}
              </View>
            );
          }
          const e = row;
          return (
            <View key={`te-${e._id}`} style={styles.card}>
              <Text style={styles.cardDate}>
                {formatYYYYMMDDtoDDMMM(e.dayYYYYMMDD)}
                {e.startTimeHHMM ? ` · ${e.startTimeHHMM}` : ""}
              </Text>
              <Text style={styles.cardMeta}>
                <Text style={styles.sourcePill}>Manual log</Text>
              </Text>
              {trackCount && e.countValue != null ? (
                <Text style={styles.cardLine}>
                  {isRatingTracker ? "Rating: " : "Value: "}
                  <Text style={styles.cardEmph}>{e.countValue}</Text>
                </Text>
              ) : null}
              {trackTime &&
              e.durationSeconds != null &&
              e.durationSeconds > 0 ? (
                <Text style={styles.cardLine}>
                  Duration:{" "}
                  <Text style={styles.cardEmph}>
                    {secondsToDurationString(e.durationSeconds)}
                  </Text>
                </Text>
              ) : null}
              {e.comments?.trim() ? (
                <Text style={styles.cardComments}>{e.comments.trim()}</Text>
              ) : null}
            </View>
          );
        })}
      </ScrollView>
    );
  };

  if (needsServerHistory) {
    return renderMerged();
  }

  if (daysSearch === undefined) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  const dayRows = daysSearch
    .filter(
      (d) =>
        d.numCompleted !== 0 || (d.comments && d.comments.trim().length > 0),
    )
    .sort((a, b) => b.dayYYYYMMDD.localeCompare(a.dayYYYYMMDD));

  if (dayRows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>No tracking history yet.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.sectionTitle}>Daily log</Text>
      {dayRows.map((d) => (
        <View key={d.dayYYYYMMDD} style={styles.card}>
          <Text style={styles.cardDate}>
            {formatYYYYMMDDtoDDMMM(d.dayYYYYMMDD)}
          </Text>
          <Text style={styles.cardLine}>
            Logged: <Text style={styles.cardEmph}>{d.numCompleted}</Text>
          </Text>
          {d.comments?.trim() ? (
            <Text style={styles.cardComments}>{d.comments.trim()}</Text>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  scrollContent: { paddingBottom: 12 },
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary, textAlign: "center" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    backgroundColor: Colors.surfaceContainerLow,
  },
  cardDate: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 4,
  },
  cardTitle: { fontSize: 14, fontWeight: "600", color: Colors.text },
  cardLine: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  cardMeta: { fontSize: 13, color: Colors.textSecondary, marginTop: 4 },
  cardEmph: { fontWeight: "600", color: Colors.text },
  sourcePill: {
    fontWeight: "600",
    color: Colors.primary,
  },
  cardComments: {
    fontSize: 13,
    color: Colors.text,
    marginTop: 8,
    fontStyle: "italic",
  },
});
