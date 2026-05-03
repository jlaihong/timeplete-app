import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  type ViewStyle,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
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
  formatTrackerDialogDuration,
  mergeTrackerDetailsHistory,
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
  autoCountFromCalendar: boolean;
}

const TRACKER_PAGE = 20;

function TableHeaderCell({
  children,
  style,
  bold,
}: {
  children?: string;
  style?: ViewStyle;
  bold?: boolean;
}) {
  return (
    <View style={[styles.thCell, style]}>
      {children !== undefined ? (
        <Text style={[styles.thText, bold && styles.thTextBold]}>{children}</Text>
      ) : null}
    </View>
  );
}

function TableDataCell({
  children,
  style,
}: {
  children: string;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.tdCell, style]}>
      <Text style={styles.tdText} numberOfLines={4}>
        {children}
      </Text>
    </View>
  );
}

/** Productivity-one: `goal().trackCount !== false` → show Value column unless explicitly false. */
function showTrackerValueColumn(trackCount: boolean | undefined): boolean {
  return trackCount !== false;
}

/** Productivity-one: `goal().trackTime !== false` → show Duration / Start columns. */
function showTrackerTimeColumns(trackTime: boolean | undefined): boolean {
  return trackTime !== false;
}

export function EditTrackableHistoryTab({
  trackableId,
  trackableType,
  startDayYYYYMMDD,
  endDayYYYYMMDD,
  trackTime,
  trackCount,
  autoCountFromCalendar,
}: EditTrackableHistoryTabProps) {
  const [trackerMergeLimit, setTrackerMergeLimit] = useState(TRACKER_PAGE);
  useEffect(() => {
    setTrackerMergeLimit(TRACKER_PAGE);
  }, [trackableId]);

  const removeTrackerEntry = useMutation(api.trackerEntries.remove);
  const removeTimeWindow = useMutation(api.timeWindows.remove);

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
    trackableType === "TRACKER";

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
          limit: trackerMergeLimit,
          offset: 0,
        }
      : "skip",
  );

  const trackerShowValueCol = showTrackerValueColumn(trackCount);
  const trackerShowTimeCols = showTrackerTimeColumns(trackTime);

  const trackerRows = useMemo(() => {
    if (trackableType !== "TRACKER" || trackerSearch === undefined) {
      return undefined;
    }
    if (timeBreakdown === undefined) {
      return undefined;
    }

    return mergeTrackerDetailsHistory({
      trackableId: String(trackableId),
      trackCount: trackerShowValueCol,
      autoCountFromCalendar,
      timeBreakdown,
      trackerEntries: trackerSearch.entries,
    });
  }, [
    trackableType,
    trackerSearch,
    timeBreakdown,
    trackableId,
    trackerShowValueCol,
    autoCountFromCalendar,
  ]);

  const daysSearch = useQuery(
    api.trackableDays.search,
    trackableType !== "TRACKER" ? { trackableIds: [trackableId] } : "skip",
  );

  const mergedGoalRows = useMemo(() => {
    if (trackableType === "TRACKER") return undefined;
    if (!needsServerHistory) return undefined;
    if (needsBreakdownWindows && timeBreakdown === undefined) return undefined;

    return buildEditDialogMergedHistory({
      trackableId: String(trackableId),
      trackableType:
        trackableType as "TIME_TRACK" | "MINUTES_A_WEEK" | "TRACKER",
      trackTime,
      timeBreakdown: needsBreakdownWindows ? timeBreakdown : undefined,
      trackerSearch: undefined,
    });
  }, [
    needsServerHistory,
    needsBreakdownWindows,
    timeBreakdown,
    trackableId,
    trackableType,
    trackTime,
  ]);

  const confirmDeleteTrackerRow = (rowId: Id<"trackerEntries">, label?: string) => {
    const run = async () => {
      try {
        await removeTrackerEntry({ id: rowId });
      } catch (e) {
        console.error(e);
      }
    };
    const title = label ? `Remove entry from ${label}?` : "Remove this entry?";
    if (Platform.OS === "web") {
      if (window.confirm(`${title}`)) void run();
      return;
    }
    Alert.alert("Remove entry", title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void run() },
    ]);
  };

  const confirmDeleteTimeWindow = (rowId: Id<"timeWindows">, label?: string) => {
    const run = async () => {
      try {
        await removeTimeWindow({ id: rowId });
      } catch (e) {
        console.error(e);
      }
    };
    const title = label ? `Remove time from ${label}?` : "Remove this time row?";
    if (Platform.OS === "web") {
      if (window.confirm(`${title}`)) void run();
      return;
    }
    Alert.alert("Remove time", title, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void run() },
    ]);
  };

  /** Productivity-one `tracker-details-dialog` Tracking History grid. */
  const renderTrackerGrid = () => {
    const loading = timeBreakdown === undefined || trackerSearch === undefined;

    if (loading) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    if (!trackerRows || trackerRows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No tracking history yet.</Text>
        </View>
      );
    }

    return (
      <>
        <ScrollView
          horizontal
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.trackerTable}>
            <View style={[styles.trackerDataRow, styles.trackerHeadRowBg]}>
              <View style={styles.trackerIconCol} />
              <Text style={[styles.cellHead, styles.trackerDateCol]}>Date</Text>
              {trackerShowValueCol ? (
                <Text style={[styles.cellHead, styles.trackerMiniCol]}>Value</Text>
              ) : null}
              {trackerShowTimeCols ? (
                <>
                  <Text style={[styles.cellHead, styles.trackerDurCol]}>Duration</Text>
                  <Text style={[styles.cellHead, styles.trackerMiniCol]}>Start</Text>
                </>
              ) : null}
              <Text style={[styles.cellHead, styles.trackerCommentsCol]}>Comments</Text>
              <View style={styles.trackerDeleteCol} />
            </View>

            {trackerRows.map((row, i) => (
              <View
                key={`${row.source}-${row.id}`}
                style={[
                  styles.trackerDataRow,
                  i % 2 === 1 ? styles.rowZebra : null,
                ]}
              >
                <View style={styles.trackerIconCol}>
                  <Ionicons
                    name={
                      row.source === "tracker_entry"
                        ? "reader-outline"
                        : "calendar-outline"
                    }
                    size={16}
                    color={Colors.textSecondary}
                    accessibilityLabel={
                      row.source === "tracker_entry"
                        ? "Manual entry"
                        : "Calendar event"
                    }
                  />
                </View>

                <Text style={[styles.cellBody, styles.trackerDateCol]} numberOfLines={2}>
                  {row.source === "tracker_entry"
                    ? formatYYYYMMDDtoDDMMM(row.dayYYYYMMDD)
                    : formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD)}
                </Text>

                {trackerShowValueCol ? (
                  <Text style={[styles.cellBody, styles.trackerMiniCol]} numberOfLines={2}>
                    {row.source === "tracker_entry"
                      ? row.countValue == null
                        ? "-"
                        : String(row.countValue)
                      : row.syntheticCount == null
                        ? "-"
                        : String(row.syntheticCount)}
                  </Text>
                ) : null}

                {trackerShowTimeCols ? (
                  <>
                    <Text style={[styles.cellBody, styles.trackerDurCol]} numberOfLines={2}>
                      {formatTrackerDialogDuration(row.durationSeconds)}
                    </Text>
                    <Text style={[styles.cellBody, styles.trackerMiniCol]} numberOfLines={2}>
                      {row.startTimeHHMM?.trim() || "-"}
                    </Text>
                  </>
                ) : null}

                <Text
                  style={[styles.cellBody, styles.trackerCommentsCol]}
                  numberOfLines={4}
                >
                  {row.source === "tracker_entry"
                    ? row.comments?.trim()
                      ? row.comments.trim()
                      : "-"
                    : row.commentsUnified.trim()
                      ? row.commentsUnified
                      : "-"}
                </Text>

                <View style={styles.trackerDeleteCol}>
                  <Pressable
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Delete tracking row"
                    onPress={() => {
                      if (row.source === "tracker_entry") {
                        confirmDeleteTrackerRow(row.id as Id<"trackerEntries">, "");
                      } else {
                        confirmDeleteTimeWindow(row.id as Id<"timeWindows">, "");
                      }
                    }}
                  >
                    <Ionicons name="trash-outline" size={22} color={Colors.text} />
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>

        {trackerSearch !== undefined &&
        trackerMergeLimit < trackerSearch.totalCount ? (
          <View style={styles.loadMoreWrap}>
            <Pressable
              style={styles.loadMoreBtn}
              onPress={() =>
                setTrackerMergeLimit((n) => {
                  const cap = trackerSearch.totalCount ?? n + TRACKER_PAGE;
                  return Math.min(n + TRACKER_PAGE, cap);
                })
              }
            >
              <Text style={styles.loadMoreLabel}>Load more</Text>
            </Pressable>
          </View>
        ) : null}
      </>
    );
  };

  const renderMergedGoals = () => {
    if (trackableType === "TRACKER") return null;
    if (!needsServerHistory) return null;
    if (needsBreakdownWindows && timeBreakdown === undefined) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>Loading…</Text>
        </View>
      );
    }
    if (!mergedGoalRows || mergedGoalRows.length === 0) {
      return (
        <View style={styles.center}>
          <Text style={styles.muted}>No tracking history yet.</Text>
        </View>
      );
    }



    const showDurationColumn = trackTime !== false;

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
            {showDurationColumn ? (
              <TableHeaderCell style={styles.colDuration}>Duration</TableHeaderCell>
            ) : null}
            <TableHeaderCell style={styles.colNotes}>Comments</TableHeaderCell>
            <TableHeaderCell style={[styles.thCell, styles.colHistAction]} bold />
          </View>
          <ScrollView
            style={styles.tableBodyScroll}
            contentContainerStyle={styles.tableBodyContent}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {mergedGoalRows.map((row, i) => {
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
                    {showDurationColumn ? (
                      <TableDataCell style={styles.colDuration}>
                        {secondsToDurationString(row.durationSeconds)}
                      </TableDataCell>
                    ) : null}
                    <TableDataCell style={styles.colNotes}>
                      {row.comments?.trim() || row.displayTitle?.trim() || "—"}
                    </TableDataCell>
                    <View style={[styles.tdCell, styles.colHistAction]}>
                      <Pressable
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel="Delete time row"
                        onPress={() =>
                          confirmDeleteTimeWindow(row._id as Id<"timeWindows">)
                        }
                      >
                        <Ionicons name="trash-outline" size={22} color={Colors.text} />
                      </Pressable>
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
                trackTime &&
                dur !== "—" &&
                trackCount &&
                val !== "—"
                  ? "Manual entry"
                  : trackCount && val !== "—"
                    ? "Manual value"
                    : trackTime && dur !== "—"
                      ? "Manual time"
                      : "Manual entry";

              return (
                <View key={`te-${e._id}`} style={[styles.dataRow, zebra]}>
                  <TableDataCell style={styles.colDate}>{dateStr}</TableDataCell>
                  <TableDataCell style={styles.colTime}>{timeStr}</TableDataCell>
                  <TableDataCell style={styles.colDesc}>{desc}</TableDataCell>
                  <TableDataCell style={styles.colSource}>Manual log</TableDataCell>
                  {showDurationColumn ? (
                    <TableDataCell style={styles.colDuration}>{dur}</TableDataCell>
                  ) : null}
                  <TableDataCell style={styles.colNotes}>
                    {e.comments?.trim() || "—"}
                  </TableDataCell>
                  <TableDataCell style={styles.colHistAction}>{" "}</TableDataCell>
              );
            })}
          </ScrollView>
        </View>
      </ScrollView>
    );
  };

  if (trackableType === "TRACKER") {
    return <View style={styles.trackerTabWrap}>{renderTrackerGrid()}</View>;
  }

  if (needsServerHistory) {
    return renderMergedGoals();
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

const styles = StyleSheet.create({
  scroll: { maxHeight: 420 },
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary, textAlign: "center" },
  trackerTabWrap: {
    gap: 0,
    minHeight: 200,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  trackerTable: {
    minWidth: 600,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
    alignSelf: "flex-start",
  },
  trackerDataRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    columnGap: 12,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  trackerHeadRowBg: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  cellHead: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    paddingVertical: 8,
    paddingHorizontal: 2,
  },
  cellBody: {
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  trackerIconCol: {
    width: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  trackerDeleteCol: {
    width: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  trackerDateCol: { width: 88 },
  trackerMiniCol: { width: 52 },
  trackerDurCol: { width: 56 },
  trackerCommentsCol: { flexGrow: 1, flexShrink: 1, minWidth: 120, flexBasis: 0 },

  loadMoreWrap: { alignItems: "center", paddingTop: 16, paddingBottom: 8 },
  loadMoreBtn: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    backgroundColor: Colors.surfaceContainer,
  },
  loadMoreLabel: { fontSize: 13, fontWeight: "600", color: Colors.text },

  tableMinWidth: {
    minWidth: 728,
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
  thTextBold: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0,
    textTransform: "none",
    fontFamily: Platform.select({ ios: undefined, android: undefined, web: "'Inter',sans-serif,system-ui"}),
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
  colHistAction: {
    width: 48,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  colProgress: { width: 72 },
  colNotesWide: { flex: 1, minWidth: 200 },
});
