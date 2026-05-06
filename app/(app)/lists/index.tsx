import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ListDialog } from "../../../components/lists/ListDialog";
import { Stack, router } from "expo-router";
import { useAuth } from "../../../hooks/useAuth";

type ListDoc = Doc<"lists"> & { trackableId?: Id<"trackables"> | null };

export default function ListsScreen() {
  const { profile } = useAuth();
  const canQueryLists = profile != null;
  const lists = useQuery(api.lists.search, canQueryLists ? {} : "skip");
  const [showArchived, setShowArchived] = useState(false);
  // `null` = closed, `"new"` = create mode, otherwise the list being edited.
  const [dialogState, setDialogState] = useState<null | "new" | ListDoc>(null);

  const filteredLists = lists
    ?.filter((l) => (showArchived ? l.archived : !l.archived))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: true, title: "All Lists" }} />

      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, !showArchived && styles.activeTab]}
          onPress={() => setShowArchived(false)}
        >
          <Text style={[styles.tabText, !showArchived && styles.activeTabText]}>
            Active
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, showArchived && styles.activeTab]}
          onPress={() => setShowArchived(true)}
        >
          <Text style={[styles.tabText, showArchived && styles.activeTabText]}>
            Archived
          </Text>
        </TouchableOpacity>
      </View>

      {!filteredLists ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : filteredLists.length === 0 ? (
        <EmptyState title="No lists" message="Create a list to organize your tasks" />
      ) : (
        <FlatList
          data={filteredLists}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <Card style={styles.listCard} padded={false}>
              <View style={styles.listRow}>
                <TouchableOpacity
                  style={styles.listRowLeft}
                  onPress={() => router.push(`/(app)/lists/${item._id}`)}
                >
                  <View
                    style={[styles.listDot, { backgroundColor: item.colour }]}
                  />
                  <View style={styles.listInfo}>
                    <Text style={styles.listName}>{item.name}</Text>
                    {item.isInbox && (
                      <Text style={styles.badge}>Inbox</Text>
                    )}
                    {item.isGoalList && (
                      <Text style={styles.badge}>Goal</Text>
                    )}
                    {!!item.trackableId && !item.isGoalList && (
                      <Text style={styles.badge}>Linked</Text>
                    )}
                  </View>
                </TouchableOpacity>
                {/* Goal-backed lists are managed from the trackable, not here. */}
                {!item.isGoalList && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => setDialogState(item)}
                    accessibilityLabel={`Edit list ${item.name}`}
                  >
                    <Ionicons
                      name="settings-outline"
                      size={18}
                      color={Colors.textSecondary}
                    />
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.openButton}
                  onPress={() => router.push(`/(app)/lists/${item._id}`)}
                  accessibilityLabel={`Open list ${item.name}`}
                >
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </Card>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setDialogState("new")}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>

      {dialogState && (
        <ListDialog
          list={dialogState === "new" ? null : dialogState}
          onClose={() => setDialogState(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { textAlign: "center", marginTop: 40, color: Colors.textSecondary },
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
  listCard: { marginBottom: 6 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  listRowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingLeft: 8,
  },
  editButton: {
    padding: 10,
    borderRadius: 6,
  },
  openButton: {
    padding: 10,
    borderRadius: 6,
  },
  listDot: { width: 14, height: 14, borderRadius: 7 },
  listInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  listName: { fontSize: 15, fontWeight: "500", color: Colors.text },
  badge: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
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
  },
});
