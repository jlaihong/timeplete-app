import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { addDays, todayYYYYMMDD } from "../../lib/dates";
import {
  mergeTrackerDetailsHistory,
  type TrackerDetailsHistoryRow,
} from "../../lib/editDialogAttributedHistory";
import {
  TrackingHistoryPlaceholder,
  TrackingHistoryTable,
} from "./TrackingHistoryTable";
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

  const handleDeleteRow = (row: TrackerDetailsHistoryRow) => {
    if (row.source === "tracker_entry") {
      confirmDeleteTrackerRow(row.id as Id<"trackerEntries">, "");
    } else {
      confirmDeleteTimeWindow(row.id as Id<"timeWindows">, "");
    }
  };

  const loading =
    timeBreakdown === undefined || trackerSearch === undefined;

  if (loading) {
    return (
      <TrackingHistoryPlaceholder>Loading…</TrackingHistoryPlaceholder>
    );
  }
  if (!trackerRows || trackerRows.length === 0) {
    return (
      <TrackingHistoryPlaceholder>No tracking history yet.</TrackingHistoryPlaceholder>
    );
  }

  const loadMoreFooter =
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
    ) : null;

  return (
    <TrackingHistoryTable
      rows={trackerRows}
      showValueColumn={trackerShowValueCol}
      showTimeColumns={trackerShowTimeCols}
      onDeleteRow={handleDeleteRow}
      footer={loadMoreFooter}
    />
  );
}

const styles = StyleSheet.create({
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
