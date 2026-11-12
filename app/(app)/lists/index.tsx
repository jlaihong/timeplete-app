import { FontSize, Radius } from "../../../theme/tokens";
import React, { useEffect, useMemo, useState } from "react";
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
import { useArchiveList } from "../../../hooks/useArchiveList";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../../components/layout/DesktopPageHeader";
import { SectionHeadingAddButton } from "../../../components/ui/SectionHeadingAddButton";

type ListDoc = Doc<"lists"> & { trackableId?: Id<"trackables"> | null };

export default function ListsScreen() {
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const canQueryLists = profileReady;
  const lists = useQuery(api.lists.search, canQueryLists ? {} : "skip");
  const [showArchived, setShowArchived] = useState(false);
  // `null` = closed, `"new"` = create mode, otherwise the list being edited.
  const [dialogState, setDialogState] = useState<null | "new" | ListDoc>(null);
  const confirmArchive = useArchiveList();

  const activeCount = useMemo(
    () => lists?.filter((l) => !l.archived).length ?? 0,
    [lists],
  );
  const archivedCount = useMemo(
    () => lists?.filter((l) => l.archived).length ?? 0,
    [lists],
  );

  useEffect(() => {
    if (showArchived && lists && archivedCount === 0) {
      setShowArchived(false);
    }
  }, [showArchived, lists, archivedCount]);

  const filteredLists = lists
    ?.filter((l) => (showArchived ? l.archived : !l.archived))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <View style={styles.container}>
      {/* Desktop hides the navigator header (it only carried a second menu
          button there) and shows the shared page title instead. */}
      <Stack.Screen options={{ headerShown: !isDesktop, title: "All Lists" }} />
      <DesktopPageHeader
        column
        title="Lists"
        right={
          <SectionHeadingAddButton
            onPress={() => setDialogState("new")}
            accessibilityLabel="Create list"
          />
        }
      />

      <View style={[styles.tabs, pageColumnStyle]}>
        <TouchableOpacity
          style={[styles.tab, !showArchived && styles.activeTab]}
          onPress={() => setShowArchived(false)}
        >
          <Text style={[styles.tabText, !showArchived && styles.activeTabText]}>
            Active ({activeCount})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.tab,
            showArchived && styles.activeTab,
            archivedCount === 0 && styles.tabDisabled,
          ]}
          onPress={() => setShowArchived(true)}
          disabled={archivedCount === 0}
        >
          <Text
            style={[
              styles.tabText,
              showArchived && styles.activeTabText,
              archivedCount === 0 && styles.tabTextDisabled,
            ]}
          >
            Archived ({archivedCount})
          </Text>
        </TouchableOpacity>
      </View>

      {!filteredLists ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : filteredLists.length === 0 ? (
        <EmptyState
          title={showArchived ? "No archived lists" : "No lists"}
          message={
            showArchived
              ? "Archive a list to hide it from the sidebar without deleting it"
              : "Create a list to organize your tasks"
          }
        />
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
                      <Text style={styles.badge}>Trackable</Text>
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
                {!item.isInbox && (
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() =>
                      confirmArchive({
                        _id: item._id,
                        name: item.name,
                        archived: item.archived,
                      })
                    }
                    accessibilityLabel={
                      item.archived
                        ? `Unarchive list ${item.name}`
                        : `Archive list ${item.name}`
                    }
                  >
                    <Ionicons
                      name="archive-outline"
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
          contentContainerStyle={[styles.listContent, pageColumnStyle]}
        />
      )}

      {/* Desktop adds from the header; phones keep the floating button. */}
      {!isDesktop && (
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setDialogState("new")}
          accessibilityRole="button"
          accessibilityLabel="Create list"
        >
          <Ionicons name="add" size={24} color={Colors.white} />
        </TouchableOpacity>
      )}

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
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceVariant,
  },
  activeTab: { backgroundColor: Colors.primary },
  tabDisabled: { opacity: 0.45 },
  tabText: { fontSize: FontSize.body, fontWeight: "600", color: Colors.textSecondary },
  activeTabText: { color: Colors.white },
  tabTextDisabled: { color: Colors.textTertiary },
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
    borderRadius: Radius.md,
  },
  openButton: {
    padding: 10,
    borderRadius: Radius.md,
  },
  listDot: { width: 14, height: 14, borderRadius: Radius.pill },
  listInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  listName: { fontSize: FontSize.body, fontWeight: "600", color: Colors.text },
  badge: {
    fontSize: FontSize.micro,
    fontWeight: "600",
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    overflow: "hidden",
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
  },
});
