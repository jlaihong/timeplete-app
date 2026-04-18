import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import {
  todayYYYYMMDD,
  addDays,
  formatDisplayDateLong,
  formatSecondsAsHM,
  parseYYYYMMDD,
} from "../../../lib/dates";

export default function CalendarScreen() {
  const [selectedDay, setSelectedDay] = useState(todayYYYYMMDD());

  const timeWindows = useQuery(api.timeWindows.search, {
    startDay: selectedDay,
    endDay: selectedDay,
  });

  const sortedWindows = useMemo(() => {
    if (!timeWindows) return [];
    return [...timeWindows].sort((a, b) =>
      a.startTimeHHMM.localeCompare(b.startTimeHHMM)
    );
  }, [timeWindows]);

  const totalDuration = useMemo(() => {
    if (!timeWindows) return 0;
    return timeWindows
      .filter((w) => w.budgetType === "ACTUAL")
      .reduce((sum, w) => sum + w.durationSeconds, 0);
  }, [timeWindows]);

  const hours = Array.from({ length: 24 }, (_, i) => i);

  return (
    <View style={styles.container}>
      <View style={styles.dayNav}>
        <TouchableOpacity
          onPress={() => setSelectedDay((d) => addDays(d, -1))}
        >
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setSelectedDay(todayYYYYMMDD())}>
          <Text style={styles.dayLabel}>
            {formatDisplayDateLong(selectedDay)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setSelectedDay((d) => addDays(d, 1))}
        >
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          {sortedWindows.length} events | {formatSecondsAsHM(totalDuration)}{" "}
          tracked
        </Text>
      </View>

      <ScrollView style={styles.timeline} contentContainerStyle={styles.timelineContent}>
        {hours.map((hour) => {
          const hourStr = String(hour).padStart(2, "0");
          const hourWindows = sortedWindows.filter((w) =>
            w.startTimeHHMM.startsWith(hourStr)
          );

          return (
            <View key={hour} style={styles.hourRow}>
              <Text style={styles.hourLabel}>
                {hour === 0 ? "12 AM" : hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`}
              </Text>
              <View style={styles.hourContent}>
                <View style={styles.hourLine} />
                {hourWindows.map((tw) => (
                  <Card key={tw._id} style={{...styles.eventCard, ...getEventColor(tw.activityType)}}>
                    <Text style={styles.eventTime}>
                      {tw.startTimeHHMM} ({formatSecondsAsHM(tw.durationSeconds)})
                    </Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>
                      {tw.title ?? tw.activityType}
                    </Text>
                    {tw.budgetType === "BUDGETED" && (
                      <Text style={styles.budgetBadge}>Budgeted</Text>
                    )}
                  </Card>
                ))}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <TouchableOpacity style={styles.fab}>
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

function getEventColor(activityType: string) {
  switch (activityType) {
    case "TASK":
      return { borderLeftColor: Colors.primary } as const;
    case "EVENT":
      return { borderLeftColor: Colors.secondary } as const;
    case "TRACKABLE":
      return { borderLeftColor: Colors.success } as const;
    default:
      return {};
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  dayNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  dayLabel: { fontSize: 16, fontWeight: "600", color: Colors.text },
  summary: {
    alignItems: "center",
    paddingBottom: 8,
  },
  summaryText: { fontSize: 13, color: Colors.textSecondary },
  timeline: { flex: 1 },
  timelineContent: { paddingHorizontal: 16, paddingBottom: 80 },
  hourRow: { flexDirection: "row", minHeight: 60 },
  hourLabel: {
    width: 56,
    fontSize: 12,
    color: Colors.textTertiary,
    paddingTop: 2,
    textAlign: "right",
    paddingRight: 8,
  },
  hourContent: { flex: 1, borderLeftWidth: 1, borderLeftColor: Colors.borderLight, paddingLeft: 12, paddingBottom: 4 },
  hourLine: { height: 1, backgroundColor: Colors.borderLight, marginBottom: 4 },
  eventCard: {
    marginBottom: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  eventTime: { fontSize: 12, color: Colors.textSecondary },
  eventTitle: { fontSize: 14, fontWeight: "500", color: Colors.text, marginTop: 2 },
  budgetBadge: {
    fontSize: 10,
    color: Colors.warning,
    fontWeight: "600",
    marginTop: 2,
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
