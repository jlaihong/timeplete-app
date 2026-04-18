import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { formatSecondsAsHM } from "../../lib/dates";
import { GroupedResult } from "../../lib/grouping";
import { Card } from "../ui/Card";

interface BreakdownListProps {
  title: string;
  items: GroupedResult[];
  totalSeconds: number;
}

export function BreakdownList({
  title,
  items,
  totalSeconds,
}: BreakdownListProps) {
  return (
    <Card style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {items.map((item) => {
        const pct =
          totalSeconds > 0
            ? Math.round((item.totalSeconds / totalSeconds) * 100)
            : 0;

        return (
          <View key={item.key} style={styles.row}>
            <View style={styles.labelRow}>
              {item.colour && (
                <View
                  style={[styles.dot, { backgroundColor: item.colour }]}
                />
              )}
              <Text style={styles.label} numberOfLines={1}>
                {item.label}
              </Text>
            </View>
            <View style={styles.valueRow}>
              <View style={styles.barContainer}>
                <View
                  style={[
                    styles.bar,
                    {
                      width: `${pct}%`,
                      backgroundColor: item.colour ?? Colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={styles.value}>
                {formatSecondsAsHM(item.totalSeconds)}
              </Text>
              <Text style={styles.pct}>{pct}%</Text>
            </View>
          </View>
        );
      })}
      {items.length === 0 && (
        <Text style={styles.empty}>No data for this period</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  row: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: 14, fontWeight: "500", color: Colors.text, flex: 1 },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  barContainer: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 2,
  },
  bar: { height: 4, borderRadius: 2 },
  value: { fontSize: 13, fontWeight: "600", color: Colors.text, width: 50 },
  pct: {
    fontSize: 12,
    color: Colors.textTertiary,
    width: 32,
    textAlign: "right",
  },
  empty: {
    textAlign: "center",
    color: Colors.textTertiary,
    paddingVertical: 16,
  },
});
