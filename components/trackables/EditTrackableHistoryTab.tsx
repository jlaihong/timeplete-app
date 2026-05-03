import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDDtoDDMMM,
  secondsToDurationString,
} from "../../lib/dates";

interface EditTrackableHistoryTabProps {
  trackableId: Id<"trackables">;
  trackTime: boolean;
  trackCount: boolean;
  isRatingTracker: boolean;
}

export function EditTrackableHistoryTab({
  trackableId,
  trackTime,
  trackCount,
  isRatingTracker,
}: EditTrackableHistoryTabProps) {
  const data = useQuery(api.trackables.getEditDialogTrackingHistory, {
    trackableId,
  });

  if (data === undefined) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Loading…</Text>
      </View>
    );
  }

  if (data === null) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>Unable to load history.</Text>
      </View>
    );
  }

  if (data.kind === "tracker") {
    if (data.entries.length === 0) {
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
        {data.entries.map((e) => (
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

  const hasDays = data.days.length > 0;
  const hasBreakdown = (data.timeBySource?.length ?? 0) > 0;

  if (!hasDays && !hasBreakdown) {
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
      {hasBreakdown && data.timeBySource ? (
        <View style={styles.breakdownBlock}>
          <Text style={styles.sectionTitle}>Time by source</Text>
          <Text style={styles.sectionHint}>
            Attributed time toward this goal between its start and end dates.
          </Text>
          {data.timeBySource.map((row) => (
            <View key={row.source} style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>{row.label}</Text>
              <Text style={styles.breakdownValue}>
                {secondsToDurationString(row.seconds)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {hasDays ? (
        <>
          <Text
            style={[
              styles.sectionTitle,
              hasBreakdown && { marginTop: 16 },
            ]}
          >
            Daily log
          </Text>
          {data.days.map((d) => (
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
        </>
      ) : null}
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
