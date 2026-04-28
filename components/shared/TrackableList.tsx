import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "../ui/EmptyState";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { AddTrackableFlow } from "../trackables/AddTrackableFlow";
import { TrackableWidgetFactory } from "../trackables/widgets/TrackableWidgetFactory";
import { TrackableDialogHost } from "../trackables/widgets/TrackableDialogHost";
import type { LogRequest } from "../trackables/widgets/types";
import { startOfWeek, todayYYYYMMDD } from "../../lib/dates";

interface TrackableListProps {
  title?: string;
  /**
   * If provided, the parent (e.g. `DesktopHome`) owns the AddTrackableFlow
   * dialog and renders it at the screen root. The plus button just calls
   * this callback. If absent (mobile), the list mounts the dialog itself.
   */
  onRequestAddTrackable?: () => void;
  /**
   * If provided, the parent owns the per-trackable quick-log dialog (e.g.
   * `TrackableDialogHost`) and renders it at the screen root. Widgets bubble
   * `LogRequest`s up via this callback. If absent (mobile), the list mounts
   * its own dialog host.
   */
  onRequestLog?: (req: LogRequest) => void;
  /**
   * Desktop-only: open the shared edit dialog at screen root.
   * If absent, widgets fall back to route-based editor.
   */
  onRequestEditTrackable?: (trackableId: string) => void;
  /**
   * When false, only active trackables are listed and the Active / Archived
   * tabs are omitted (home page behaviour). Defaults to true (e.g. Goals tab).
   */
  showArchivedToggle?: boolean;
}

/**
 * Top-level list of trackable widgets. Each row delegates to
 * `TrackableWidgetFactory`, which selects the right per-type body
 * (days-a-week pill, minutes-a-week timer pill, number stepper, etc.) and
 * wraps it in the shared `TrackableWidgetCard` chrome.
 */
export function TrackableList({
  title,
  onRequestAddTrackable,
  onRequestLog,
  onRequestEditTrackable,
  showArchivedToggle = true,
}: TrackableListProps) {
  const isDesktop = useIsDesktop();

  // Compute today / weekStart once per render. The query depends on these
  // values, so the cache key changes only when the day rolls over — which is
  // the productivity-one behaviour (week pill resets at midnight Monday).
  const today = useMemo(() => todayYYYYMMDD(), []);
  const weekStart = useMemo(() => startOfWeek(today), [today]);

  const goalDetails = useQuery(api.trackables.getGoalDetails, {
    today,
    weekStart,
  });

  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Local fallback state for when no parent owns the dialogs (mobile Goals
  // tab). On desktop these are `undefined` because `DesktopHome` owns them.
  const [localShowAdd, setLocalShowAdd] = useState(false);
  const [localLogRequest, setLocalLogRequest] = useState<LogRequest | null>(
    null
  );

  const openAddTrackable = () => {
    if (onRequestAddTrackable) {
      onRequestAddTrackable();
    } else {
      setLocalShowAdd(true);
    }
  };

  const handleRequestLog = (req: LogRequest) => {
    if (onRequestLog) {
      onRequestLog(req);
    } else {
      setLocalLogRequest(req);
    }
  };

  if (!goalDetails) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading trackables...</Text>
      </View>
    );
  }

  const isShowingArchivedList = showArchivedToggle && showArchived;
  const displayGoals = isShowingArchivedList
    ? goalDetails.archived
    : goalDetails.active;

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {isDesktop && (
            <TouchableOpacity onPress={openAddTrackable}>
              <Ionicons name="add-circle" size={24} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {showArchivedToggle && (
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, !showArchived && styles.activeTab]}
            onPress={() => setShowArchived(false)}
          >
            <Text
              style={[styles.tabText, !showArchived && styles.activeTabText]}
            >
              Active ({goalDetails.activeCount})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, showArchived && styles.activeTab]}
            onPress={() => setShowArchived(true)}
          >
            <Text
              style={[styles.tabText, showArchived && styles.activeTabText]}
            >
              Archived ({goalDetails.archivedCount})
            </Text>
          </TouchableOpacity>
          {!title && isDesktop && (
            <TouchableOpacity
              onPress={openAddTrackable}
              style={styles.inlineAdd}
            >
              <Ionicons name="add-circle" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      )}

      {displayGoals.length === 0 ? (
        <EmptyState
          title={
            isShowingArchivedList
              ? "No archived trackables"
              : "No active trackables"
          }
          message={
            isShowingArchivedList
              ? "Archive trackables you've completed"
              : "Create a trackable to start tracking your progress"
          }
        />
      ) : (
        <FlatList
          data={displayGoals}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TrackableWidgetFactory
              goal={item}
              today={today}
              onRequestLog={handleRequestLog}
              onRequestEditTrackable={onRequestEditTrackable}
            />
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 500);
              }}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      {!isDesktop && (
        <TouchableOpacity style={styles.fab} onPress={openAddTrackable}>
          <Ionicons name="add" size={28} color={Colors.onPrimary} />
        </TouchableOpacity>
      )}

      {localShowAdd && (
        <AddTrackableFlow onClose={() => setLocalShowAdd(false)} />
      )}

      <TrackableDialogHost
        request={localLogRequest}
        onClose={() => setLocalLogRequest(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  loadingText: { color: Colors.textSecondary },
  // Flat header — no surface fill, no bottom rule. (Req 1: single-surface layout.)
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: Colors.surfaceVariant,
  },
  activeTab: { backgroundColor: Colors.primary },
  tabText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  activeTabText: { color: Colors.onPrimary },
  inlineAdd: { marginLeft: "auto" },
  listContent: { padding: 16, paddingBottom: 80 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    ...Platform.select({
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.4)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
    }),
  },
});
