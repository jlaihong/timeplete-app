import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type TextStyle,
  type ViewStyle,
} from "react-native";
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

function TableHeaderCell({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.thCell, style]}>
      <Text style={styles.thText}>{children}</Text>
    </View>
  );
}

function TableDataCell({
  children,
  style,
  textStyle,
  numberOfLines = 4,
}: {
  children: string;
  style?: ViewStyle;
  textStyle?: TextStyle;
  numberOfLines?: number;
}) {
  return (
    <View style={[styles.tdCell, style]}>
      <Text style={[styles.tdText, textStyle]} numberOfLines={numberOfLines}>
        {children}
      </Text>
    </View>
  );
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

  const trackerHasValueColumn = trackCount;
  const showDurationColumn =
    trackableType !== "TRACKER" || trackTime || needsBreakdownWindows;

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
        horizontal
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.tableMinWidth}>
          <View style={styles.headerRow}>
            <TableHeaderCell style={styles.colDate}>Date</TableHeaderCell>
            <TableHeaderCell style={styles.colTime}>Start</TableHeaderCell>
            <TableHeaderCell style={styles.colDesc}>Description</TableHeaderCell>
            <TableHeaderCell style={styles.colSource}>Source</TableHeaderCell>
            {trackerHasValueColumn ? (
              <TableHeaderCell style={styles.colValue}>
                {isRatingTracker ? "Rating" : "Value"}
              </TableHeaderCell>
            ) : null}
            {showDurationColumn ? (
              <TableHeaderCell style={styles.colDuration}>
                Duration
              </TableHeaderCell>
            ) : null}
            <TableHeaderCell style={styles.colNotes}>Comments</TableHeaderCell>
          </View>
          <ScrollView
            style={styles.tableBodyScroll}
            contentContainerStyle={styles.tableBodyContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {mergedRows.map((row, i) => {
              const zebra = i % 2 === 1 ? styles.rowZebra : null;
              if (row.kind === "time_window") {
                const dateStr = formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD);
                const timeStr = row.startTimeHHMM || "—";
                return (
                  <View key={`tw-${row._id}`} style={[styles.dataRow, zebra]}>
                    <TableDataCell style={styles.colDate}>{dateStr}</TableDataCell>
                    <TableDataCell style={styles.colTime}>{timeStr}</TableDataCell>
                    <TableDataCell style={styles.colDesc}>
                      {row.displayTitle}
                    </TableDataCell>
                    <TableDataCell style={styles.colSource}>
                      {labelForEditDialogTimeSource(row.source)}
                    </TableDataCell>
                    {trackerHasValueColumn ? (
                      <TableDataCell style={styles.colValue}>—</TableDataCell>
                    ) : null}
                    {showDurationColumn ? (
                      <TableDataCell style={styles.colDuration}>
                        {secondsToDurationString(row.durationSeconds)}
                      </TableDataCell>
                    ) : null}
                    <TableDataCell style={styles.colNotes}>
                      {row.comments?.trim() || "—"}
                    </TableDataCell>
                  </View>
                );
              }

              const e = row;
              const dateStr = formatYYYYMMDDtoDDMMM(e.dayYYYYMMDD);
              const timeStr = e.startTimeHHMM || "—";
              const dur =
                trackTime &&
                e.durationSeconds != null &&
                e.durationSeconds > 0
                  ? secondsToDurationString(e.durationSeconds)
                  : "—";
              const val =
                trackCount && e.countValue != null ? String(e.countValue) : "—";
              const desc =
                trackTime && dur !== "—" && trackCount && val !== "—"
                  ? "Manual entry"
                  : trackCount && val !== "—"
                    ? isRatingTracker
                      ? "Manual rating"
                      : "Manual value"
                    : trackTime && dur !== "—"
                      ? "Manual time"
                      : "Manual entry";

              return (
                <View key={`te-${e._id}`} style={[styles.dataRow, zebra]}>
                  <TableDataCell style={styles.colDate}>{dateStr}</TableDataCell>
                  <TableDataCell style={styles.colTime}>{timeStr}</TableDataCell>
                  <TableDataCell style={styles.colDesc}>{desc}</TableDataCell>
                  <TableDataCell style={styles.colSource}>Manual log</TableDataCell>
                  {trackerHasValueColumn ? (
                    <TableDataCell style={styles.colValue}>{val}</TableDataCell>
                  ) : null}
                  {showDurationColumn ? (
                    <TableDataCell style={styles.colDuration}>{dur}</TableDataCell>
                  ) : null}
                  <TableDataCell style={styles.colNotes}>
                    {e.comments?.trim() || "—"}
                  </TableDataCell>
                </View>
              );
            })}
          </ScrollView>
        </View>
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
      horizontal
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.tableMinWidthDaily}>
        <View style={styles.headerRow}>
          <TableHeaderCell style={styles.colDate}>Date</TableHeaderCell>
          <TableHeaderCell style={styles.colProgress}>Logged</TableHeaderCell>
          <TableHeaderCell style={styles.colNotesWide}>Comments</TableHeaderCell>
        </View>
        <ScrollView
          style={styles.tableBodyScroll}
          contentContainerStyle={styles.tableBodyContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {dayRows.map((d, i) => (
            <View
              key={d.dayYYYYMMDD}
              style={[styles.dataRow, i % 2 === 1 ? styles.rowZebra : null]}
            >
              <TableDataCell style={styles.colDate}>
                {formatYYYYMMDDtoDDMMM(d.dayYYYYMMDD)}
              </TableDataCell>
              <TableDataCell style={styles.colProgress}>
                {String(d.numCompleted)}
              </TableDataCell>
              <TableDataCell style={styles.colNotesWide}>
                {d.comments?.trim() || "—"}
              </TableDataCell>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

/** Material-style dense data table (~productivity-one mat-table parity). */
const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary, textAlign: "center" },
  tableMinWidth: {
    minWidth: 640,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  tableMinWidthDaily: {
    minWidth: 480,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.surfaceContainerHigh,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outline,
  },
  thCell: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.outlineVariant,
  },
  thText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  tableBodyScroll: {
    maxHeight: 346,
    backgroundColor: Colors.surface,
  },
  tableBodyContent: {
    paddingBottom: 4,
  },
  dataRow: {
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    minHeight: 40,
  },
  rowZebra: {
    backgroundColor: Colors.surfaceContainerLow,
  },
  tdCell: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    justifyContent: "center",
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.outlineVariant,
  },
  tdText: {
    fontSize: 13,
    color: Colors.text,
    lineHeight: 18,
  },
  colDate: { width: 92 },
  colTime: { width: 52 },
  colDesc: { flex: 1, minWidth: 140 },
  colSource: { width: 96 },
  colValue: { width: 56 },
  colDuration: { width: 72 },
  colNotes: { flex: 1, minWidth: 120 },
  colProgress: { width: 72 },
  colNotesWide: { flex: 1, minWidth: 200 },
});
