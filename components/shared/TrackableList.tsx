import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
  ScrollView,
  useWindowDimensions,
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
   * tabs are omitted (home page behaviour). Defaults to true on list variants
   * that use the Active / Archived toggle (not `trackables-page`).
   */
  showArchivedToggle?: boolean;
  /**
   * - `productivity-one-goals`: blue Tasks-style header strip + centered title.
   * - `trackables-page`: productivity-one `goals-page.html` — page title + add,
   *   "Current trackables" / "Archived trackables" sections, responsive grid
   *   (no Active/Archived tab strip).
   */
  variant?: "default" | "productivity-one-goals" | "trackables-page";
}

/**
 * Top-level list of trackable widgets. Each row delegates to
 * `TrackableWidgetFactory`, which selects the right per-type body
 * (days-a-week pill, minutes-a-week timer pill, number stepper, etc.) and
 * wraps it in the shared `TrackableWidgetCard` chrome.
 */
/** Matches `#1787D8` productivity-one Tasks panel (`DayActionTaskComponent.tsx`). */
const P_ONE_TASKS_HEADER_BLUE = "#1787D8";

/** Breakpoints aligned with productivity-one `goals-page.css` grid rules. */
function trackablesPageColumnCount(windowWidth: number): number {
  if (windowWidth <= 600) return 1;
  if (windowWidth <= 900) return 2;
  if (windowWidth <= 1200) return 3;
  return 4;
}

export function TrackableList({
  title,
  onRequestAddTrackable,
  onRequestLog,
  onRequestEditTrackable,
  showArchivedToggle = true,
  variant = "default",
}: TrackableListProps) {
  const isDesktop = useIsDesktop();
  const { width: windowWidth } = useWindowDimensions();

  // Recompute each render so long-lived sessions advance past midnight and
  // past a goal's `startDayYYYYMMDD`. `getGoalDetails` clamps
  // `periodicOverallProgress` with `today`; freezing the first-mount date
  // (previous `useMemo(..., [])`) left the overall bar at 0 forever when that
  // snapshot was before the goal started.
  const today = todayYYYYMMDD();
  const weekStart = startOfWeek(today);

  const [activePageLimit, setActivePageLimit] = useState(20);
  const [archivedPageLimit, setArchivedPageLimit] = useState(20);
  const trackablesPageFetchLimit =
    variant === "trackables-page"
      ? Math.max(activePageLimit, archivedPageLimit)
      : undefined;

  const goalDetails = useQuery(api.trackables.getGoalDetails, {
    today,
    weekStart,
    ...(trackablesPageFetchLimit != null
      ? { limit: trackablesPageFetchLimit }
      : {}),
  });

  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Local fallback state for when no parent owns the dialogs (mobile Goals
  // tab). On desktop these are `undefined` because `DesktopHome` owns them.
  const [localShowAdd, setLocalShowAdd] = useState(false);
  const [localLogRequest, setLocalLogRequest] = useState<LogRequest | null>(
    null
  );

  /** Trackables-page grid: measured row width so tile sizes match padded shell (fixes 4th card wrapping). */
  const [trackablesPageGridWidth, setTrackablesPageGridWidth] = useState(0);

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

  if (variant === "trackables-page") {
    const pageTitle = title ?? "Trackables";
    /** Viewport-based column count — matches productivity-one `goals-page.css` media queries. */
    const cols = trackablesPageColumnCount(windowWidth);
    const gridGap = 8;
    /**
     * goals.tsx uses `maxWidth: min(1200, 80vw)` + `padding: 24`. Until `onLayout`
     * runs, approximate inner row width so SSR/first paint matches ~4 tiles when allowed.
     */
    const goalsShellHorizontalPadding = 48;
    const maxShell =
      isDesktop && windowWidth >= 900
        ? Math.min(1200, windowWidth * 0.8)
        : Math.min(1200, windowWidth);
    const fallbackRowWidth = Math.max(
      240,
      maxShell - goalsShellHorizontalPadding
    );
    const rowWidth =
      trackablesPageGridWidth > 0 ? trackablesPageGridWidth : fallbackRowWidth;
    const tileWidth = (rowWidth - gridGap * (cols - 1)) / cols;

    const onTrackablesGridLayout = (w: number) => {
      if (w > 0 && Math.abs(w - trackablesPageGridWidth) > 0.5) {
        setTrackablesPageGridWidth(w);
      }
    };

    const hasMoreActive = goalDetails.activeCount > goalDetails.active.length;
    const hasMoreArchived =
      goalDetails.archivedCount > goalDetails.archived.length;

    const renderGoalTile = (goal: (typeof goalDetails.active)[0]) => (
      <View
        key={goal._id}
        style={[styles.trackablesPageTile, { width: tileWidth }]}
      >
        <TrackableWidgetFactory
          goal={goal}
          today={today}
          onRequestLog={handleRequestLog}
          onRequestEditTrackable={onRequestEditTrackable}
        />
      </View>
    );

    return (
      <View style={styles.container}>
        <ScrollView
          style={styles.trackablesPageScroll}
          contentContainerStyle={styles.trackablesPageScrollContent}
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
        >
          <View style={styles.trackablesPageTitleRow}>
            <Text style={styles.trackablesPageTitle}>{pageTitle}</Text>
            <TouchableOpacity
              onPress={openAddTrackable}
              accessibilityRole="button"
              accessibilityLabel="Add trackable"
            >
              <Ionicons name="add-circle" size={28} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.trackablesPageSectionHeading}>
            Current trackables
          </Text>
          <View style={styles.trackablesPageDivider} />
          <View style={styles.trackablesPageSectionSpacer} />

          {goalDetails.active.length === 0 ? (
            <Text style={styles.trackablesPageEmpty}>No active trackables</Text>
          ) : (
            <View
              style={[styles.trackablesPageGrid, { gap: gridGap }]}
              onLayout={(e) =>
                onTrackablesGridLayout(e.nativeEvent.layout.width)
              }
            >
              {goalDetails.active.map(renderGoalTile)}
            </View>
          )}

          {hasMoreActive && (
            <TouchableOpacity
              style={styles.trackablesPageLoadMore}
              onPress={() => setActivePageLimit((n) => n + 20)}
            >
              <Text style={styles.trackablesPageLoadMoreText}>
                Load more active trackables
              </Text>
            </TouchableOpacity>
          )}

          <Text style={styles.trackablesPageSectionHeadingArchived}>
            Archived trackables
          </Text>
          <View style={styles.trackablesPageDivider} />
          <View style={styles.trackablesPageSectionSpacer} />

          {goalDetails.archived.length === 0 ? (
            <Text style={styles.trackablesPageEmpty}>
              No archived trackables
            </Text>
          ) : (
            <View
              style={[styles.trackablesPageGrid, { gap: gridGap }]}
              onLayout={(e) =>
                onTrackablesGridLayout(e.nativeEvent.layout.width)
              }
            >
              {goalDetails.archived.map(renderGoalTile)}
            </View>
          )}

          {hasMoreArchived && (
            <TouchableOpacity
              style={styles.trackablesPageLoadMore}
              onPress={() => setArchivedPageLimit((n) => n + 20)}
            >
              <Text style={styles.trackablesPageLoadMoreText}>
                Load more archived trackables
              </Text>
            </TouchableOpacity>
          )}

          <View style={styles.trackablesPageBottomSpacer} />
        </ScrollView>

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

  const isShowingArchivedList = showArchivedToggle && showArchived;
  const displayGoals = isShowingArchivedList
    ? goalDetails.archived
    : goalDetails.active;

  const productivityGoalsChrome =
    variant === "productivity-one-goals" && title;

  return (
    <View style={styles.container}>
      {productivityGoalsChrome ? (
        <View style={styles.pOneGoalsBanner}>
          <TouchableOpacity
            onPress={openAddTrackable}
            accessibilityRole="button"
            accessibilityLabel="Add trackable"
          >
            <Ionicons name="add-circle-outline" size={34} color={Colors.white} />
          </TouchableOpacity>
          <Text style={styles.pOneGoalsBannerTitle}>{title}</Text>
          <View style={styles.pOneGoalsBannerSpacer} />
        </View>
      ) : (
        title && (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
            {isDesktop && (
              <TouchableOpacity onPress={openAddTrackable}>
                <Ionicons name="add-circle" size={24} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        )
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
          {!title && !productivityGoalsChrome && isDesktop && (
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
  pOneGoalsBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: P_ONE_TASKS_HEADER_BLUE,
  },
  pOneGoalsBannerTitle: {
    flex: 1,
    textAlign: "center",
    color: Colors.white,
    fontSize: 22,
    fontWeight: "600",
  },
  pOneGoalsBannerSpacer: {
    width: 34,
    height: 34,
  },
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
  trackablesPageScroll: { flex: 1 },
  trackablesPageScrollContent: {
    paddingBottom: 32,
    alignItems: "center",
    width: "100%",
  },
  trackablesPageTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  trackablesPageTitle: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.text,
    textAlign: "center",
  },
  trackablesPageSectionHeading: {
    alignSelf: "stretch",
    maxWidth: 1200,
    width: "100%",
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  trackablesPageSectionHeadingArchived: {
    alignSelf: "stretch",
    maxWidth: 1200,
    width: "100%",
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text,
    marginTop: 28,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  trackablesPageDivider: {
    alignSelf: "stretch",
    maxWidth: 1200,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.outlineVariant,
  },
  trackablesPageSectionSpacer: { height: 8 },
  trackablesPageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignSelf: "stretch",
    maxWidth: 1200,
    width: "100%",
    justifyContent: "flex-start",
  },
  trackablesPageTile: { minWidth: 0 },
  trackablesPageEmpty: {
    alignSelf: "stretch",
    maxWidth: 1200,
    color: Colors.textTertiary,
    fontSize: 15,
    paddingHorizontal: 4,
  },
  trackablesPageLoadMore: {
    alignSelf: "center",
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.outline,
  },
  trackablesPageLoadMoreText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: "600",
  },
  trackablesPageBottomSpacer: { height: 24 },
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
