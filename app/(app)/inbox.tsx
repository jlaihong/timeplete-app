import React, { useMemo } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Redirect, Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../../hooks/useAuth";
import { Colors } from "../../constants/colors";
import { EmptyState } from "../../components/ui/EmptyState";

/**
 * Back-compat route: productivity-one navigates Inbox as `/lists/:inboxListId`.
 * Keep `/inbox` as a redirect so bookmarks and old bundles still work.
 */
export default function InboxRedirectScreen() {
  const { profile } = useAuth();
  const lists = useQuery(api.lists.search, profile != null ? {} : "skip");
  const inbox = useMemo(() => {
    if (lists === undefined) return undefined;
    const candidates = lists.filter((l) => l.isInbox && !l.archived);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => a.orderIndex - b.orderIndex)[0];
  }, [lists]);

  if (lists === undefined || inbox === undefined) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Inbox" }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.muted}>Loading Inbox…</Text>
      </View>
    );
  }

  if (inbox === null) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Inbox" }} />
        <EmptyState
          title="No Inbox list"
          message="Your account should include a system Inbox. Try signing out and back in, or contact support."
        />
      </View>
    );
  }

  return <Redirect href={`/(app)/lists/${inbox._id}`} />;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
    padding: 24,
    gap: 12,
  },
  muted: { fontSize: 14, color: Colors.textSecondary },
});
