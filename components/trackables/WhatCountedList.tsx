import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import { formatYYYYMMDDtoDDMMM } from "../../lib/dates";
import { formatMeasure } from "../../lib/trackableShape";
import { MentionText } from "../mentions/MentionText";

interface Props {
  trackableId: Id<"trackables">;
}

const PAGE = 30;

const ICON = {
  event: "calendar-outline",
  task: "checkmark-circle-outline",
  value: "create-outline",
  checkIn: "checkbox-outline",
} as const;

/**
 * "What counted" on a trackable's page: a read-only log of what fed it.
 * Events and logged time, completed tasks, and values or check-ins logged
 * by hand, newest first, each with the sub-trackable it came through.
 *
 * It explains the numbers; it is not a task list. Things are changed
 * where they live (the calendar, a list).
 */
export function WhatCountedList({ trackableId }: Props) {
  const { profileReady } = useAuth();
  const {
    results: items,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.trackableProgress.counted,
    profileReady ? { id: trackableId } : "skip",
    { initialNumItems: PAGE },
  );
  if (status === "LoadingFirstPage") return null;
  if (items.length === 0) {
    return (
      <Text style={styles.empty}>
        Nothing yet. Allocate a task or event to this trackable, or give it a
        rule, and it shows up here.
      </Text>
    );
  }

  return (
    <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Ionicons
            name={ICON[item.kind]}
            size={16}
            color={Colors.textSecondary}
          />
          <Text style={styles.day}>
            {formatYYYYMMDDtoDDMMM(item.dayYYYYMMDD)}
          </Text>
          <View style={styles.titleCell}>
            <MentionText
              text={
                item.title ||
                (item.kind === "checkIn"
                  ? "Checked in"
                  : item.kind === "value"
                    ? "Logged"
                    : "Untitled")
              }
              style={styles.title}
              numberOfLines={1}
            />
          </View>
          {item.via.length > 0 ? (
            <View style={styles.via}>
              <View
                style={[styles.dot, { backgroundColor: item.via[0].colour }]}
              />
              <Text style={styles.viaText} numberOfLines={1}>
                {item.via.map((v) => v.name).join(" + ")}
              </Text>
            </View>
          ) : null}
          <Text style={styles.value}>
            {item.seconds
              ? formatMeasure("time", item.seconds)
              : item.kind === "task"
                ? "done"
                : item.count !== null
                  ? formatMeasure("count", item.count)
                  : ""}
          </Text>
        </View>
      ))}
      {status === "CanLoadMore" || status === "LoadingMore" ? (
        <Pressable
          onPress={() => loadMore(PAGE)}
          disabled={status === "LoadingMore"}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={styles.moreText}>
            {status === "LoadingMore" ? "Loading…" : "Load more"}
          </Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  empty: { fontSize: FontSize.body, color: Colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  more: { alignSelf: "center", paddingVertical: 12, paddingHorizontal: 16 },
  moreText: { fontSize: FontSize.body, color: Colors.primary },
  day: { width: 52, fontSize: FontSize.caption, color: Colors.textSecondary },
  titleCell: { flex: 1, minWidth: 0 },
  title: { fontSize: FontSize.body, color: Colors.text },
  via: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    maxWidth: 170,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  viaText: { fontSize: FontSize.caption, color: Colors.textSecondary },
  value: {
    minWidth: 44,
    textAlign: "right",
    fontSize: FontSize.body,
    color: Colors.text,
  },
});
