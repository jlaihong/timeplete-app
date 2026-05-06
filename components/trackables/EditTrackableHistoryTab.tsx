import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import {
  formatYYYYMMDDtoDDMMM,
  addDays,
  todayYYYYMMDD,
} from "../../lib/dates";
import {
  formatTrackerDialogDuration,
  mergeTrackerDetailsHistory,
} from "../../lib/editDialogAttributedHistory";
import { TrackingHistoryScroller } from "./TrackingHistoryScroller";
import { useAuth } from "../../hooks/useAuth";

interface EditTrackableHistoryTabProps {
  trackableId: Id<"trackables">;
  trackTime: boolean;
  trackCount: boolean;
  autoCountFromCalendar: boolean;
}

const TRACKER_PAGE = 20;

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
  trackTime,
  trackCount,
  autoCountFromCalendar,
}: EditTrackableHistoryTabProps) {
  const { profileReady } = useAuth();
  const [trackerMergeLimit, setTrackerMergeLimit] = useState(TRACKER_PAGE);
  useEffect(() => {
    setTrackerMergeLimit(TRACKER_PAGE);
  }, [trackableId]);

  const removeTrackerEntry = useMutation(api.trackerEntries.remove);
  const removeTimeWindow = useMutation(api.timeWindows.remove);

  const wideRange = useMemo(() => {
    const end = todayYYYYMMDD();
    return { startDay: addDays(end, -7300), endDay: end };
  }, []);

  const timeBreakdown = useQuery(
    api.analytics.getTimeBreakdown,
    profileReady
      ? {
          startDay: wideRange.startDay,
          endDay: wideRange.endDay,
        }
      : "skip",
  );

  const trackerSearch = useQuery(
    api.trackerEntries.search,
    profileReady
      ? {
          trackableId,
          startDay: wideRange.startDay,
          endDay: wideRange.endDay,
          limit: trackerMergeLimit,
          offset: 0,
        }
      : "skip",
  );

  const trackerShowValueCol = showTrackerValueColumn(trackCount);
  const trackerShowTimeCols = showTrackerTimeColumns(trackTime);

  const trackerRows = useMemo(() => {
    if (trackerSearch === undefined || timeBreakdown === undefined) {
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
    trackerSearch,
    timeBreakdown,
    trackableId,
    trackerShowValueCol,
    autoCountFromCalendar,
  ]);

  const confirmDeleteTrackerRow = (
    rowId: Id<"trackerEntries">,
    label?: string,
  ) => {
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

  const confirmDeleteTimeWindow = (
    rowId: Id<"timeWindows">,
    label?: string,
  ) => {
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

  const loading =
    timeBreakdown === undefined || trackerSearch === undefined;

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
    <View style={styles.trackerTabWrap}>
      <TrackingHistoryScroller
        style={[
          styles.scroll,
          Platform.OS === "web" ? styles.historyScrollWeb : null,
        ]}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        showsHorizontalScrollIndicator
      >
        <View style={styles.trackerTable}>
          <View style={[styles.trackerDataRow, styles.trackerHeadRowBg]}>
            <View style={styles.trackerIconCol} />
            <Text
              style={[styles.cellHead, styles.trackerDateCol]}
              numberOfLines={1}
              ellipsizeMode="clip"
            >
              Date
            </Text>
            {trackerShowValueCol ? (
              <Text
                style={[styles.cellHead, styles.trackerMiniCol]}
                numberOfLines={1}
                ellipsizeMode="clip"
              >
                Value
              </Text>
            ) : null}
            {trackerShowTimeCols ? (
              <>
                <Text
                  style={[styles.cellHead, styles.trackerDurCol]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                >
                  Duration
                </Text>
                <Text
                  style={[styles.cellHead, styles.trackerMiniCol]}
                  numberOfLines={1}
                  ellipsizeMode="clip"
                >
                  Start
                </Text>
              </>
            ) : null}
            <Text
              style={[styles.cellHead, styles.trackerCommentsHeader]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              Comments
            </Text>
            <View style={styles.trackerDeleteCol} />
          </View>

          {trackerRows.map((row, i) => (
            <View
              key={`${row.source}-${row.id}`}
              style={[styles.trackerDataRow, i % 2 === 1 ? styles.rowZebra : null]}
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

              <Text
                style={[styles.cellBody, styles.trackerDateCol]}
                numberOfLines={2}
              >
                {row.source === "tracker_entry"
                  ? formatYYYYMMDDtoDDMMM(row.dayYYYYMMDD)
                  : formatYYYYMMDDtoDDMMM(row.startDayYYYYMMDD)}
              </Text>

              {trackerShowValueCol ? (
                <Text
                  style={[styles.cellBody, styles.trackerMiniCol]}
                  numberOfLines={2}
                >
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
                  <Text
                    style={[styles.cellBody, styles.trackerDurCol]}
                    numberOfLines={2}
                  >
                    {formatTrackerDialogDuration(row.durationSeconds)}
                  </Text>
                  <Text
                    style={[styles.cellBody, styles.trackerMiniCol]}
                    numberOfLines={2}
                  >
                    {row.startTimeHHMM?.trim() || "-"}
                  </Text>
                </>
              ) : null}

              <View style={styles.trackerCommentsCol}>
                <Text style={styles.cellBody} numberOfLines={4}>
                  {row.source === "tracker_entry"
                    ? row.comments?.trim()
                      ? row.comments.trim()
                      : "-"
                    : row.commentsUnified.trim()
                      ? row.commentsUnified
                      : "-"}
                </Text>
              </View>

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
                  <Ionicons name="trash-outline" size={20} color={Colors.text} />
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </TrackingHistoryScroller>

      {trackerMergeLimit < trackerSearch.totalCount ? (
        <View style={styles.loadMoreWrap}>
          <Pressable
            style={styles.loadMoreBtn}
            onPress={() =>
              setTrackerMergeLimit((n) => {
                const cap =
                  trackerSearch.totalCount ?? n + TRACKER_PAGE;
                return Math.min(n + TRACKER_PAGE, cap);
              })
            }
          >
            <Text style={styles.loadMoreLabel}>Load more</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  historyScrollWeb:
    Platform.OS === "web"
      ? ({
          overflowY: "scroll",
          overflowX: "hidden",
          flexGrow: 1,
        } as unknown as ViewStyle)
      : ({} as ViewStyle),
  center: { paddingVertical: 24, alignItems: "center" },
  muted: { fontSize: 14, color: Colors.textTertiary, textAlign: "center" },
  trackerTabWrap: {
    gap: 0,
    flex: 1,
    minHeight: 0,
    marginTop: 8,
    paddingHorizontal: 0,
    alignSelf: "stretch",
    width: "100%",
    overflow: "hidden",
  },
  trackerTable: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    borderRadius: 4,
    overflow: "hidden",
  },
  trackerDataRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    minHeight: 40,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    columnGap: 6,
    paddingHorizontal: 2,
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
    ...(Platform.OS === "web" ? ({ whiteSpace: "nowrap" } as TextStyle) : {}),
  },
  cellBody: {
    fontSize: 13,
    color: Colors.text,
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  trackerIconCol: {
    width: 26,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  trackerDeleteCol: {
    width: 36,
    minWidth: 36,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 2,
    marginLeft: 2,
  },
  trackerDateCol: {
    width: 72,
    flexShrink: 0,
    minWidth: 0,
  },
  trackerMiniCol: {
    width: 44,
    flexShrink: 0,
    minWidth: 0,
    textAlign: "center" as const,
  },
  trackerDurCol: {
    width: 64,
    flexShrink: 0,
    minWidth: 64,
  },
  trackerCommentsCol: {
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    marginRight: 2,
  },
  trackerCommentsHeader: {
    flex: 1,
    flexShrink: 1,
    minWidth: 72,
    marginRight: 2,
  },
  rowZebra: {
    backgroundColor: Colors.surfaceContainerLow,
  },
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
});
