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
import {
  buildEditDialogTimeBySource,
  type EditDialogTimeWindow,
} from "../../lib/editDialogTrackingHistory";

export type EditTrackableHistoryTabMode = "history" | "breakdown";

export type EditDialogTrackableType =
  | "NUMBER"
  | "TIME_TRACK"
  | "DAYS_A_WEEK"
  | "MINUTES_A_WEEK"
  | "TRACKER";

const TRACKER_BREAKDOWN_FALLBACK = {
  startDay: "19700101",
  endDay: "21001231",
} as const;

interface EditTrackableHistoryTabProps {
  trackableId: Id<"trackables">;
  trackableType: EditDialogTrackableType;
  startDayYYYYMMDD: string;
  endDayYYYYMMDD: string;
  trackTime: boolean;
  trackCount: boolean;
  isRatingTracker: boolean;
  mode: EditTrackableHistoryTabMode;
  breakdownHint: string;
}

export function EditTrackableHistoryTab({
  trackableId,
  trackableType,
  startDayYYYYMMDD,
  endDayYYYYMMDD,
  trackTime,
  trackCount,
  isRatingTracker,
  mode,
  breakdownHint,
}: EditTrackableHistoryTabProps) {
  const trackerSearch = useQuery(
    api.trackerEntries.search,
    trackableType === "TRACKER"
      ? { trackableId, limit: 2000 }
      : "skip"
  );

  const daysSearch = useQuery(
    api.trackableDays.search,
    trackableType !== "TRACKER" ? { trackableIds: [trackableId] } : "skip"
  );

  const needsTimeBreakdown =
    mode === "breakdown" &&
    (trackableType === "TIME_TRACK" ||
      trackableType === "MINUTES_A_WEEK" ||
      (trackableType === "TRACKER" && trackTime));

  const breakdownRange = useMemo(() => {
    if (!needsTimeBreakdown) return null;
    if (trackableType === "TRACKER") {
      const end = todayYYYYMMDD();
      return { startDay: addDays(end, -7300), endDay: end };
    }
    const s =
      startDayYYYYMMDD.replace(/\D/g, "").slice(0, 8) || startDayYYYYMMDD;
    const e = endDayYYYYMMDD.replace(/\D/g, "").slice(0, 8) || endDayYYYYMMDD;
    if (s.length === 8 && e.length === 8) return { startDay: s, endDay: e };
    return TRACKER_BREAKDOWN_FALLBACK;
  }, [
    needsTimeBreakdown,
    trackableType,
    startDayYYYYMMDD,
    endDayYYYYMMDD,
  ]);

  const timeBreakdown = useQuery(
    api.analytics.getTimeBreakdown,
    breakdownRange
      ? {
          startDay: breakdownRange.startDay,
          endDay: breakdownRange.endDay,
        }
      : "skip"
  );

  const trackerEntryDurationSeconds = useMemo(() => {
    if (trackableType !== "TRACKER" || !trackerSearch?.entries.length) return 0;
    return trackerSearch.entries.reduce(
      (s, e) => s + (e.durationSeconds ?? 0),
      0
    );
  }, [trackableType, trackerSearch]);

  const timeBySourceRows = useMemo(() => {
    if (!needsTimeBreakdown || !timeBreakdown) return [];
    const tasks = timeBreakdown.tasks as Record<
      string,
      { trackableId?: string; listId?: string } | undefined
    >;
    const listIdToTrackableId =
      (timeBreakdown as { listIdToTrackableId?: Record<string, string> })
        .listIdToTrackableId ?? {};
    const windows = timeBreakdown.timeWindows as EditDialogTimeWindow[];

    if (
      trackableType !== "TIME_TRACK" &&
      trackableType !== "MINUTES_A_WEEK" &&
      trackableType !== "TRACKER"
    ) {
      return [];
    }

    return buildEditDialogTimeBySource({
      trackableId: String(trackableId),
      trackableType,
      startDayYYYYMMDD,
      endDayYYYYMMDD,
      windows,
      tasks,
      listIdToTrackableId,
      trackerEntryDurationSeconds,
    });
  }, [
    needsTimeBreakdown,
    timeBreakdown,
    trackableId,
    trackableType,
    startDayYYYYMMDD,
    endDayYYYYMMDD,
    trackerEntryDurationSeconds,
  ]);

  if (mode === "breakdown") {
    if (!needsTimeBreakdown) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No breakdown for this trackable.</Text>
        </View>
      );
    }
    if (timeBreakdown === undefined) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    if (timeBySourceRows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No time breakdown yet.</Text>
        </View>
      );
    }
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.breakdownBlock}>
          <Text style={styles.sectionTitle}>Time by source</Text>
          <Text style={styles.sectionHint}>{breakdownHint}</Text>
          {timeBySourceRows.map((row) => (
            <View key={row.source} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{row.label}</Text>
              <Text style={styles.breakdownValue}>
                {secondsToDurationString(row.seconds)}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    );
  }

  // mode === "history"
  if (trackableType === "TRACKER") {
    if (trackerSearch === undefined) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    const entries = trackerSearch.entries;
    if (entries.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No tracking entries yet.</Text>
        </View>
      );
    }
    return (
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionTitle}>Entries</Text>
        {entries.map((e) => (
          <View key={e._id} style={styles.card}>
            <Text style={styles.cardDate}>
              {formatYYYYMMDDtoDDMMM(e.dayYYYYMMDD)}
            </Text>
            {trackCount && e.countValue != null && (
              <Text style={styles.cardLine}>
                {isRatingTracker ? "Rating: " : "Value: "}
                <Text style={styles.cardEmph}>{e.countValue}</Text>
              </Text>
            )}
            {trackTime && e.durationSeconds != null && e.durationSeconds > 0 && (
              <Text style={styles.cardLine}>
                Duration:{" "}
                <Text style={styles.cardEmph}>
                  {secondsToDurationString(e.durationSeconds)}
                </Text>
                {e.startTimeHHMM ? ` · ${e.startTimeHHMM}` : ""}
              </Text>
            )}
            {e.comments?.trim() ? (
              <Text style={styles.cardComments}>{e.comments.trim()}</Text>
            ) : null}
          </View>
        ))}
      </ScrollView>
    );
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
        d.numCompleted !== 0 ||
        (d.comments && d.comments.trim().length > 0)
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
            Logged:{" "}
            <Text style={styles.cardEmph}>{d.numCompleted}</Text>
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
  sectionHint: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginBottom: 10,
    lineHeight: 16,
  },
  breakdownBlock: {
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    padding: 12,
    backgroundColor: Colors.surfaceContainer,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  breakdownLabel: { fontSize: 14, color: Colors.text, flex: 1 },
  breakdownValue: { fontSize: 14, fontWeight: "600", color: Colors.text },
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
  cardLine: { fontSize: 13, color: Colors.textSecondary },
  cardEmph: { fontWeight: "600", color: Colors.text },
  cardComments: {
    fontSize: 13,
    color: Colors.text,
    marginTop: 8,
    fontStyle: "italic",
  },
});
