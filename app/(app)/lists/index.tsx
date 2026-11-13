import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { Stack, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import { EmptyState } from "../../../components/ui/EmptyState";
import { ListDialog } from "../../../components/lists/ListDialog";
import { useAuth } from "../../../hooks/useAuth";
import { useArchiveList } from "../../../hooks/useArchiveList";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../../components/layout/DesktopPageHeader";
import { SectionHeadingAddButton } from "../../../components/ui/SectionHeadingAddButton";
import {
  EntityGroupHeading,
  EntityRow,
  type EntityRowAction,
} from "../../../components/ui/EntityRow";
import {
  SortableRows,
  SORTABLE_ROWS_DRAGGABLE,
} from "../../../components/ui/SortableRows";

type ListDoc = Doc<"lists"> & { trackableId?: Id<"trackables"> | null };

const byOrder = (a: ListDoc, b: ListDoc) => a.orderIndex - b.orderIndex;

/**
 * Lists: flat rows in three groups.
 *   - Your lists: the ones you made, which you can drag into order. This is
 *     the order the sidebar shows them in.
 *   - Trackable lists: one per trackable, created with it.
 *   - Archived: folded away under a toggle.
 * Clicking a row opens the list; the pencil opens its settings.
 */
export default function ListsScreen() {
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip") as
    | ListDoc[]
    | undefined;
  const moveList = useMutation(api.lists.move);
  const [showArchived, setShowArchived] = useState(false);
  // `null` = closed, `"new"` = create mode, otherwise the list being edited.
  const [dialogState, setDialogState] = useState<null | "new" | ListDoc>(null);
  const confirmArchive = useArchiveList();

  const groups = useMemo(() => {
    const all = lists ?? [];
    const live = all.filter((l) => !l.archived);
    return {
      inbox: live.filter((l) => l.isInbox).sort(byOrder),
      own: live.filter((l) => !l.isInbox && !l.isGoalList).sort(byOrder),
      trackable: live.filter((l) => l.isGoalList).sort(byOrder),
      archived: all.filter((l) => l.archived).sort(byOrder),
    };
  }, [lists]);

  const openList = (list: ListDoc) => router.push(`/(app)/lists/${list._id}`);

  const renderRow = (list: ListDoc, draggable: boolean) => {
    const actions: EntityRowAction[] = [];
    // Goal-backed lists are managed from the trackable, not here.
    if (!list.isGoalList) {
      actions.push({
        icon: "pencil-outline",
        label: `Edit list ${list.name}`,
        onPress: () => setDialogState(list),
      });
    }
    if (!list.isInbox) {
      actions.push({
        icon: "archive-outline",
        label: list.archived
          ? `Unarchive list ${list.name}`
          : `Archive list ${list.name}`,
        onPress: () =>
          confirmArchive({
            _id: list._id,
            name: list.name,
            archived: list.archived,
          }),
      });
    }
    return (
      <EntityRow
        colour={list.colour}
        name={list.name}
        note={
          list.trackableId && !list.isGoalList ? "Linked to a trackable" : undefined
        }
        onPress={() => openList(list)}
        pressLabel={`Open list ${list.name}`}
        actions={actions}
        showGrip={draggable && SORTABLE_ROWS_DRAGGABLE}
        showChevron
      />
    );
  };

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

      {!lists ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : lists.length === 0 ? (
        <EmptyState
          title="No lists"
          message="Create a list to organize your tasks"
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, pageColumnStyle]}>
          {groups.inbox.map((list) => (
            <React.Fragment key={list._id}>
              {renderRow(list, false)}
            </React.Fragment>
          ))}

          <EntityGroupHeading title="Your lists" count={groups.own.length} />
          {groups.own.length === 0 ? (
            <Text style={styles.emptyGroup}>
              Lists you create appear here and in the sidebar.
            </Text>
          ) : (
            <SortableRows
              items={groups.own}
              onMove={(id, toIndex) => void moveList({ id, toIndex })}
              renderRow={(list) => renderRow(list, true)}
            />
          )}

          {groups.trackable.length > 0 ? (
            <>
              <EntityGroupHeading
                title="Trackable lists"
                count={groups.trackable.length}
              />
              {groups.trackable.map((list) => (
                <React.Fragment key={list._id}>
                  {renderRow(list, false)}
                </React.Fragment>
              ))}
            </>
          ) : null}

          {/* Archived lists fold away under a quiet toggle, not a second tab. */}
          {groups.archived.length > 0 ? (
            <>
              <Pressable
                onPress={() => setShowArchived((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showArchived }}
                style={styles.archivedToggle}
              >
                <Ionicons
                  name={showArchived ? "chevron-down" : "chevron-forward"}
                  size={14}
                  color={Colors.textTertiary}
                />
                <Text style={styles.archivedToggleText}>
                  Archived ({groups.archived.length})
                </Text>
              </Pressable>
              {showArchived
                ? groups.archived.map((list) => (
                    <React.Fragment key={list._id}>
                      {renderRow(list, false)}
                    </React.Fragment>
                  ))
                : null}
            </>
          ) : null}
        </ScrollView>
      )}

      {/* Desktop adds from the header; phones keep the floating button. */}
      {!isDesktop && (
        <Pressable
          style={styles.fab}
          onPress={() => setDialogState("new")}
          accessibilityRole="button"
          accessibilityLabel="Create list"
        >
          <Ionicons name="add" size={24} color={Colors.onPrimary} />
        </Pressable>
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
  loading: {
    textAlign: "center",
    marginTop: 40,
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  content: { paddingHorizontal: 16, paddingBottom: 96 },
  emptyGroup: {
    fontSize: FontSize.body,
    color: Colors.textTertiary,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  archivedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 16,
  },
  archivedToggleText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
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
    elevation: 4,
  },
});
