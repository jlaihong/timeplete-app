import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useQuery, useMutation } from "convex/react";
import { Stack } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Colors, stackHeaderChromeOptions } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { EmptyState } from "../../components/ui/EmptyState";
import { DrawerMenuButton } from "../../components/layout/DrawerMenuButton";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../components/layout/DesktopPageHeader";
import { SectionHeadingAddButton } from "../../components/ui/SectionHeadingAddButton";
import { EntityRow } from "../../components/ui/EntityRow";
import {
  SortableRows,
  SORTABLE_ROWS_DRAGGABLE,
} from "../../components/ui/SortableRows";
import { TagDialog } from "../../components/tags/TagDialog";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useAuth } from "../../hooks/useAuth";

/**
 * Tags: flat rows you can drag into order. Clicking a row opens the tag
 * dialog, where archive and delete live.
 */
export default function TagsScreen() {
  const isDesktop = useIsDesktop();
  const { profileReady } = useAuth();
  const tags = useQuery(api.tags.search, profileReady ? {} : "skip");
  const moveTag = useMutation(api.tags.move);
  const [showArchived, setShowArchived] = useState(false);
  // `null` = closed, `"new"` = create, otherwise the tag being edited.
  const [dialog, setDialog] = useState<null | "new" | Doc<"tags">>(null);

  const active = useMemo(
    () =>
      (tags ?? [])
        .filter((t) => !t.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [tags],
  );
  const archived = useMemo(
    () =>
      (tags ?? [])
        .filter((t) => t.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [tags],
  );

  const renderRow = (tag: Doc<"tags">, draggable: boolean) => (
    <EntityRow
      colour={tag.colour}
      name={tag.name}
      onPress={() => setDialog(tag)}
      pressLabel={`Edit tag ${tag.name}`}
      showGrip={draggable && SORTABLE_ROWS_DRAGGABLE}
    />
  );

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...stackHeaderChromeOptions,
          headerShown: !isDesktop,
          title: "Tags",
          headerLeft: () => <DrawerMenuButton />,
        }}
      />
      <DesktopPageHeader
        column
        title="Tags"
        right={
          <SectionHeadingAddButton
            onPress={() => setDialog("new")}
            accessibilityLabel="Add tag"
          />
        }
      />

      {!tags ? (
        <Text style={styles.loading}>Loading…</Text>
      ) : tags.length === 0 ? (
        <EmptyState
          title="No tags yet"
          message="Create tags to organize your tasks"
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, pageColumnStyle]}>
          {active.length === 0 ? (
            <Text style={styles.loading}>No active tags</Text>
          ) : (
            <SortableRows
              items={active}
              onMove={(id, toIndex) => void moveTag({ id, toIndex })}
              renderRow={(tag) => renderRow(tag, true)}
            />
          )}

          {/* Archived tags fold away under a quiet toggle, not a second tab. */}
          {archived.length > 0 ? (
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
                  Archived ({archived.length})
                </Text>
              </Pressable>
              {showArchived
                ? archived.map((tag) => (
                    <React.Fragment key={tag._id}>
                      {renderRow(tag, false)}
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
          onPress={() => setDialog("new")}
          accessibilityRole="button"
          accessibilityLabel="Add tag"
        >
          <Ionicons name="add" size={24} color={Colors.onPrimary} />
        </Pressable>
      )}

      {dialog ? (
        <TagDialog
          tag={dialog === "new" ? null : dialog}
          onClose={() => setDialog(null)}
        />
      ) : null}
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
