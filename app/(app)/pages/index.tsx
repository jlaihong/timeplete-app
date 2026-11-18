import React, { useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import {
  DesktopPageHeader,
  pageColumnStyle,
} from "../../../components/layout/DesktopPageHeader";
import { usePages, rememberCreatedPage } from "../../../hooks/usePages";
import { matchPages, sanitizePageName } from "../../../lib/mentions";
import { openPage } from "../../../lib/openPage";
import { PAGE_KIND_ICON, PAGE_KIND_LABEL } from "../../../components/mentions/pageKinds";
import { pageAncestors, pageTreeRows, placePage } from "../../../lib/pageTree";
import {
  PAGES_DRAGGABLE,
  PAGE_INDENT,
  PageDragList,
  type PagePlace,
} from "../../../components/pages/PageDragList";
import type { Id } from "../../../convex/_generated/dataModel";

/** Pages folded shut, kept while the app is open so the list reads the
 * same after visiting a page. */
const collapsedPages = new Set<string>();

const INDENT = PAGE_INDENT;

/**
 * Pages: everything you can link to with "@". One field both finds a page
 * and makes a new one, the same way the "@" picker does.
 *
 * Pages nest, so the list is a tree; a page with others under it folds.
 * On the web pages are dragged up and down to rearrange them, and right
 * or left to go under the page above or come back out. While
 * searching, matches are listed flat with where each one sits.
 */
export default function PagesScreen() {
  const { pages, loaded, byId } = usePages();
  const [collapsed, setCollapsed] = useState(() => new Set(collapsedPages));
  const toggle = (id: string) => {
    if (collapsedPages.has(id)) collapsedPages.delete(id);
    else collapsedPages.add(id);
    setCollapsed(new Set(collapsedPages));
  };
  const createPage = useMutation(api.pages.create);
  const [query, setQuery] = useState("");
  const [moveError, setMoveError] = useState<string | null>(null);
  // The tree shows the move at once; the server confirms or undoes it.
  const movePage = useMutation(api.pages.move).withOptimisticUpdate(
    (store, args) => {
      const list = store.getQuery(api.pages.list, {});
      if (!list) return;
      const parentId = args.parentId ?? undefined;
      const order = new Map(
        placePage(
          list.filter((p) => p.parentId === parentId),
          args.id,
          args,
        ).map((p) => [p._id, p.orderIndex]),
      );
      store.setQuery(
        api.pages.list,
        {},
        list.map((p) =>
          order.has(p._id)
            ? {
                ...p,
                orderIndex: order.get(p._id),
                parentId: p._id === args.id ? parentId : p.parentId,
              }
            : p,
        ),
      );
    },
  );
  const move = (id: string, parentId: string | null, place: PagePlace) => {
    setMoveError(null);
    // A page dropped into a folded page would vanish: open it.
    if (parentId && collapsedPages.delete(parentId)) {
      setCollapsed(new Set(collapsedPages));
    }
    movePage({
      id: id as Id<"pages">,
      parentId: parentId as Id<"pages"> | null,
      beforeId: place.beforeId as Id<"pages"> | undefined,
      afterId: place.afterId as Id<"pages"> | undefined,
    }).catch((e) => {
      setMoveError(e instanceof Error ? e.message : "Couldn't move the page.");
    });
  };

  const name = sanitizePageName(query);
  const shown = useMemo(
    () =>
      name
        ? matchPages(pages, name, 500).map((page) => ({
            page,
            depth: 0,
            hasChildren: false,
          }))
        : pageTreeRows(pages, collapsed),
    [pages, name, collapsed],
  );
  /** Where a search match sits; the tree already shows it. */
  const pathFor = (id: string) =>
    name
      ? pageAncestors(byId, id)
          .map((p) => p.name)
          .join(" › ")
      : "";
  const canCreate =
    name !== "" && !pages.some((p) => p.name.toLowerCase() === name.toLowerCase());

  const create = async () => {
    if (!canCreate) return;
    const id = await createPage({ name });
    rememberCreatedPage(id, name);
    setQuery("");
    openPage(id);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: "Pages" }} />
      <DesktopPageHeader column title="Pages" />

      <ScrollView
        contentContainerStyle={[styles.content, pageColumnStyle]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              if (canCreate && shown.length === 0) void create();
              else if (shown.length === 1) openPage(shown[0].page._id);
            }}
            placeholder="Find or create a page"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Find or create a page"
            style={[
              styles.searchInput,
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
        </View>

        {!loaded ? (
          <Text style={styles.quiet}>Loading…</Text>
        ) : pages.length === 0 && !name ? (
          <Text style={styles.quiet}>
            No pages yet. Type @ and a name in any text to make one, or name
            one above.
          </Text>
        ) : null}

        {moveError ? <Text style={styles.error}>{moveError}</Text> : null}
        <PageDragList
          rows={shown}
          pages={pages}
          enabled={!name}
          onMove={move}
          renderRow={({ page, depth, hasChildren }, drag) => {
            const path = pathFor(page._id);
            return (
          <Pressable
            onPress={(e) =>
              openPage(
                page._id,
                (e as unknown as { nativeEvent?: MouseEvent }).nativeEvent,
              )
            }
            accessibilityRole="link"
            accessibilityLabel={`Open ${page.name}`}
            style={(state) => [
              styles.row,
              { paddingLeft: 8 + depth * INDENT },
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.rowHover,
              drag.overlay && styles.rowOverlay,
            ]}
          >
            {name ? null : hasChildren ? (
              <Pressable
                onPress={() => toggle(page._id)}
                accessibilityRole="button"
                accessibilityLabel={
                  collapsed.has(page._id)
                    ? `Show pages under ${page.name}`
                    : `Hide pages under ${page.name}`
                }
                accessibilityState={{ expanded: !collapsed.has(page._id) }}
                style={styles.fold}
              >
                <Ionicons
                  name={
                    collapsed.has(page._id) ? "chevron-forward" : "chevron-down"
                  }
                  size={14}
                  color={Colors.textTertiary}
                />
              </Pressable>
            ) : (
              <View style={styles.foldSpace} />
            )}
            <Ionicons
              name={PAGE_KIND_ICON[page.kind ?? "other"]}
              size={16}
              color={Colors.textSecondary}
            />
            <Text style={styles.rowName} numberOfLines={1}>
              {page.name}
            </Text>
            {path ? (
              <Text style={styles.rowPath} numberOfLines={1}>
                {path}
              </Text>
            ) : null}
            {page.kind ? (
              <Text style={styles.rowNote}>{PAGE_KIND_LABEL[page.kind]}</Text>
            ) : null}
          </Pressable>
            );
          }}
        />
        {PAGES_DRAGGABLE && !name && pages.length > 1 ? (
          <Text style={styles.hint}>
            Drag pages to rearrange them. Drag one to the right to put it
            under the page above, or to the left to take it back out.
          </Text>
        ) : null}

        {canCreate ? (
          <Pressable
            onPress={() => void create()}
            accessibilityRole="button"
            style={(state) => [
              styles.row,
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.rowHover,
            ]}
          >
            <Ionicons name="add" size={16} color={Colors.textSecondary} />
            <Text style={styles.rowName} numberOfLines={1}>
              Create “{name}”
            </Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 96 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainerLow,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  quiet: {
    paddingHorizontal: 8,
    paddingVertical: 12,
    fontSize: FontSize.body,
    color: Colors.textTertiary,
  },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 8,
    borderRadius: Radius.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.borderLight,
  },
  rowHover: { backgroundColor: Colors.surfaceContainerLow },
  /** The copy floating under the pointer: same look as a dragged task. */
  rowOverlay: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderBottomColor: "transparent",
    ...Platform.select({
      web: {
        cursor: "grabbing",
        boxShadow: "0 12px 24px rgba(0,0,0,0.5)",
      } as object,
      default: {},
    }),
  },
  hint: {
    paddingHorizontal: 8,
    paddingTop: 14,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  error: {
    paddingHorizontal: 8,
    paddingBottom: 8,
    fontSize: FontSize.caption,
    color: Colors.error,
  },
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  /* The fold button fills the row's height and the space either side of
   * its chevron, so a tap near the chevron folds instead of opening the
   * page. Negative margins keep the chevron where `foldSpace` puts it. */
  fold: {
    width: 40,
    alignSelf: "stretch",
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -12,
    marginRight: -16,
  },
  foldSpace: { width: 16, marginRight: -4 },
  rowPath: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: "45%",
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  rowNote: { fontSize: FontSize.caption, color: Colors.textTertiary },
});
