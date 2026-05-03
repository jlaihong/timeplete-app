import React, { useMemo, useState } from "react";
import {
  View,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { Stack } from "expo-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { EmptyState } from "../../components/ui/EmptyState";
import { AddTaskSheet } from "../../components/tasks/AddTaskSheet";
import { InboxTaskList } from "../../components/inbox/InboxTaskList";

/**
 * Inbox — system capture list (`lists.isInbox`). Mirrors productivity-one's
 * Inbox list view (`lists.getPaginated`): section buckets only, never the
 * day-of-week grouping used on Tasks home.
 */
export default function InboxScreen() {
  const lists = useQuery(api.lists.search, {});
  const inbox = useMemo(() => {
    if (lists === undefined) return undefined;
    const candidates = lists.filter((l) => l.isInbox && !l.archived);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => a.orderIndex - b.orderIndex)[0];
  }, [lists]);

  const paginatedList = useQuery(
    api.lists.getPaginated,
    inbox ? { listId: inbox._id } : "skip",
  );

  const [showAddTask, setShowAddTask] = useState(false);

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

  if (paginatedList === undefined) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: "Inbox" }} />
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.muted}>Loading Inbox…</Text>
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <Stack.Screen
        options={{
          title: "Inbox",
          headerStyle: { backgroundColor: Colors.surface },
        }}
      />
      <InboxTaskList
        fullList={inbox}
        paginatedList={paginatedList}
        onPressAdd={() => setShowAddTask(true)}
      />

      {showAddTask && (
        <AddTaskSheet
          listId={inbox._id}
          onClose={() => setShowAddTask(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: Colors.background },
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
