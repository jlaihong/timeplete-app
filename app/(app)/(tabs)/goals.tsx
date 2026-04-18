import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { router } from "expo-router";
import { formatSecondsAsHM } from "../../../lib/dates";

export default function GoalsScreen() {
  const goalDetails = useQuery(api.trackables.getGoalDetails, {});
  const archiveTrackable = useMutation(api.trackables.archive);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (!goalDetails) {
    return (
      <View style={styles.loading}>
        <Text>Loading goals...</Text>
      </View>
    );
  }

  const displayGoals = showArchived
    ? goalDetails.archived
    : goalDetails.active;

  const renderGoalCard = ({ item }: { item: (typeof displayGoals)[0] }) => {
    const progressPercent = getProgressPercent(item);

    return (
      <Card style={styles.goalCard}>
        <View style={styles.goalHeader}>
          <View
            style={[styles.goalDot, { backgroundColor: item.colour }]}
          />
          <Text style={styles.goalName} numberOfLines={1}>
            {item.name}
          </Text>
          <TouchableOpacity
            onPress={() =>
              router.push(`/(app)/edit-trackable/${item._id}`)
            }
          >
            <Ionicons
              name="pencil-outline"
              size={18}
              color={Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.goalStats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {item.trackableType === "TIME_TRACK" ||
              item.trackableType === "MINUTES_A_WEEK"
                ? formatSecondsAsHM(item.totalTimeSeconds)
                : item.totalCount.toString()}
            </Text>
            <Text style={styles.statLabel}>
              {item.trackableType === "TIME_TRACK"
                ? "tracked"
                : item.trackableType === "DAYS_A_WEEK"
                  ? "days"
                  : "count"}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{item.calendarCount}</Text>
            <Text style={styles.statLabel}>sessions</Text>
          </View>
        </View>

        {progressPercent !== null && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(progressPercent, 100)}%`,
                    backgroundColor:
                      progressPercent >= 100 ? Colors.success : item.colour,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {Math.round(progressPercent)}%
            </Text>
          </View>
        )}

        <View style={styles.goalType}>
          <Text style={styles.goalTypeBadge}>{item.trackableType.replace(/_/g, " ")}</Text>
          {item.frequency && (
            <Text style={styles.goalFrequency}>{item.frequency}</Text>
          )}
        </View>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, !showArchived && styles.activeTab]}
          onPress={() => setShowArchived(false)}
        >
          <Text
            style={[
              styles.tabText,
              !showArchived && styles.activeTabText,
            ]}
          >
            Active ({goalDetails.activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, showArchived && styles.activeTab]}
          onPress={() => setShowArchived(true)}
        >
          <Text
            style={[
              styles.tabText,
              showArchived && styles.activeTabText,
            ]}
          >
            Archived ({goalDetails.archivedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {displayGoals.length === 0 ? (
        <EmptyState
          title={showArchived ? "No archived goals" : "No active goals"}
          message={
            showArchived
              ? "Archive goals you've completed"
              : "Create a goal to start tracking your progress"
          }
        />
      ) : (
        <FlatList
          data={displayGoals}
          keyExtractor={(item) => item._id}
          renderItem={renderGoalCard}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                setTimeout(() => setRefreshing(false), 500);
              }}
            />
          }
        />
      )}

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function getProgressPercent(goal: any): number | null {
  switch (goal.trackableType) {
    case "NUMBER":
      return goal.targetCount
        ? (goal.totalCount / goal.targetCount) * 100
        : null;
    case "TIME_TRACK":
      return goal.targetNumberOfHours
        ? (goal.totalTimeSeconds / (goal.targetNumberOfHours * 3600)) * 100
        : null;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
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
  activeTabText: { color: Colors.white },
  listContent: { padding: 16, paddingBottom: 80 },
  goalCard: { marginBottom: 12 },
  goalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  goalDot: { width: 14, height: 14, borderRadius: 7 },
  goalName: { flex: 1, fontSize: 16, fontWeight: "600", color: Colors.text },
  goalStats: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 12,
  },
  stat: {},
  statValue: { fontSize: 20, fontWeight: "700", color: Colors.text },
  statLabel: { fontSize: 12, color: Colors.textSecondary },
  progressContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  progressBar: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 3,
  },
  progressFill: { height: 6, borderRadius: 3 },
  progressText: { fontSize: 12, fontWeight: "600", color: Colors.textSecondary },
  goalType: { flexDirection: "row", gap: 8 },
  goalTypeBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
  goalFrequency: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
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
      web: { boxShadow: "0 4px 8px rgba(0,0,0,0.2)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
    }),
  },
});
