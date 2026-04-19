import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import {
  todayYYYYMMDD,
  addDays,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  formatSecondsAsHM,
  formatDisplayDate,
} from "../../lib/dates";

type Period = "daily" | "weekly" | "monthly" | "yearly";

interface AnalyticsViewProps {
  title?: string;
}

export function AnalyticsView({ title }: AnalyticsViewProps) {
  const [period, setPeriod] = useState<Period>("daily");
  const [offset, setOffset] = useState(0);

  const today = todayYYYYMMDD();
  const { startDay, endDay, label } = useMemo(() => {
    switch (period) {
      case "daily": {
        const day = addDays(today, offset);
        return { startDay: day, endDay: day, label: formatDisplayDate(day) };
      }
      case "weekly": {
        const base = addDays(today, offset * 7);
        return {
          startDay: startOfWeek(base),
          endDay: endOfWeek(base),
          label: `${formatDisplayDate(startOfWeek(base))} - ${formatDisplayDate(endOfWeek(base))}`,
        };
      }
      case "monthly": {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        const base = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
        return {
          startDay: startOfMonth(base),
          endDay: endOfMonth(base),
          label: d.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
          }),
        };
      }
      case "yearly": {
        const y = new Date().getFullYear() + offset;
        const base = `${y}0101`;
        return {
          startDay: startOfYear(base),
          endDay: endOfYear(base),
          label: String(y),
        };
      }
    }
  }, [period, offset, today]);

  const breakdown = useQuery(api.analytics.getTimeBreakdown, {
    startDay,
    endDay,
  });

  const stats = useMemo(() => {
    if (!breakdown) return null;

    const windows = breakdown.timeWindows;
    const totalSeconds = windows.reduce((s, w) => s + w.durationSeconds, 0);
    const totalEvents = windows.length;

    const byActivity: Record<string, number> = {};
    for (const w of windows) {
      byActivity[w.activityType] =
        (byActivity[w.activityType] ?? 0) + w.durationSeconds;
    }

    // Union attribution — mirrors the server-side `timeWindowAttributedToTrackable`
    // so this client aggregate matches `getGoalDetails` / `getProgressionStats`.
    // Resolution order: window.trackableId → task.trackableId → list.trackableId.
    const tasksMap = breakdown.tasks as Record<
      string,
      { trackableId?: string; listId?: string } | undefined
    >;
    const listIdToTrackableId =
      (breakdown as any).listIdToTrackableId as Record<string, string> ?? {};

    const resolveTrackable = (w: {
      trackableId?: string | null;
      taskId?: string | null;
    }): string | null => {
      if (w.trackableId) return w.trackableId;
      if (!w.taskId) return null;
      const task = tasksMap[w.taskId];
      if (!task) return null;
      if (task.trackableId) return task.trackableId;
      if (task.listId) return listIdToTrackableId[task.listId] ?? null;
      return null;
    };

    const byTrackable: { name: string; seconds: number; colour: string }[] = [];
    const trackableMap = new Map<string, number>();
    for (const w of windows) {
      const tid = resolveTrackable(w);
      if (tid) {
        trackableMap.set(tid, (trackableMap.get(tid) ?? 0) + w.durationSeconds);
      }
    }
    for (const [id, seconds] of trackableMap) {
      const t = (breakdown.trackables as any)[id];
      if (t) {
        byTrackable.push({ name: t.name, seconds, colour: t.colour });
      }
    }
    byTrackable.sort((a, b) => b.seconds - a.seconds);

    return { totalSeconds, totalEvents, byActivity, byTrackable };
  }, [breakdown]);

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      )}

      <View style={styles.periodTabs}>
        {(["daily", "weekly", "monthly", "yearly"] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.periodTab, period === p && styles.activePeriodTab]}
            onPress={() => {
              setPeriod(p);
              setOffset(0);
            }}
          >
            <Text
              style={[
                styles.periodTabText,
                period === p && styles.activePeriodTabText,
              ]}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.navigator}>
        <TouchableOpacity onPress={() => setOffset((o) => o - 1)}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset(0)}>
          <Text style={styles.periodLabel}>{label}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset((o) => o + 1)}>
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!stats ? (
          <Text style={styles.loadingText}>Loading analytics...</Text>
        ) : (
          <>
            <View style={styles.summaryRow}>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryValue}>
                  {formatSecondsAsHM(stats.totalSeconds)}
                </Text>
                <Text style={styles.summaryLabel}>Total Time</Text>
              </Card>
              <Card style={styles.summaryCard}>
                <Text style={styles.summaryValue}>{stats.totalEvents}</Text>
                <Text style={styles.summaryLabel}>Sessions</Text>
              </Card>
            </View>

            <Card style={styles.sectionCard}>
              <Text style={styles.cardTitle}>By Activity</Text>
              {Object.entries(stats.byActivity).map(([type, secs]) => (
                <View key={type} style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>{type}</Text>
                  <Text style={styles.breakdownValue}>
                    {formatSecondsAsHM(secs as number)}
                  </Text>
                </View>
              ))}
            </Card>

            {stats.byTrackable.length > 0 && (
              <Card style={styles.sectionCard}>
                <Text style={styles.cardTitle}>By Goal</Text>
                {stats.byTrackable.map((item) => (
                  <View key={item.name} style={styles.breakdownRow}>
                    <View style={styles.breakdownLabelRow}>
                      <View
                        style={[
                          styles.colorDot,
                          { backgroundColor: item.colour },
                        ]}
                      />
                      <Text style={styles.breakdownLabel}>{item.name}</Text>
                    </View>
                    <Text style={styles.breakdownValue}>
                      {formatSecondsAsHM(item.seconds)}
                    </Text>
                  </View>
                ))}
              </Card>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  periodTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  periodTab: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: Colors.surfaceVariant,
  },
  activePeriodTab: { backgroundColor: Colors.primary },
  periodTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  activePeriodTabText: { color: Colors.onPrimary },
  navigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  periodLabel: { fontSize: 15, fontWeight: "600", color: Colors.text },
  content: { padding: 16, paddingBottom: 40 },
  loadingText: {
    textAlign: "center",
    color: Colors.textSecondary,
    marginTop: 40,
  },
  summaryRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
  summaryCard: { flex: 1, alignItems: "center" as const },
  summaryValue: { fontSize: 24, fontWeight: "700", color: Colors.text },
  summaryLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  sectionCard: { marginBottom: 16 },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  breakdownLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorDot: { width: 10, height: 10, borderRadius: 5 },
  breakdownLabel: { fontSize: 14, color: Colors.text },
  breakdownValue: { fontSize: 14, fontWeight: "600", color: Colors.text },
});
