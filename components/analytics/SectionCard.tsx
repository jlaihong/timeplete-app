import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";

export function SectionCard({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

/* Flattened: no per-card border/background/padding. The analytics
 * page reads as one continuous list of sections divided only by the
 * title row + spacing. */
const styles = StyleSheet.create({
  card: {
    marginBottom: 24,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  right: { flexShrink: 0 },
  body: {},
});
