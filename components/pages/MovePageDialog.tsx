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
import { Ionicons } from "@expo/vector-icons";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import {
  DialogCard,
  DialogHeader,
  SheetOverlay,
  usePhoneSheet,
} from "../ui/DialogScaffold";
import { PAGE_KIND_ICON } from "../mentions/pageKinds";
import { matchPages, sanitizePageName } from "../../lib/mentions";
import { pageParentOptions, pageTreeRows } from "../../lib/pageTree";

interface Props {
  page: Doc<"pages">;
  pages: Doc<"pages">[];
  /** `null`: back to the top level. */
  onMove: (parentId: Id<"pages"> | null) => void;
  onClose: () => void;
}

/**
 * Chooses the page another one sits under. A page cannot go under itself,
 * under anything below it, or deeper than the tree allows, so those are
 * not offered.
 */
export function MovePageDialog({ page, pages, onMove, onClose }: Props) {
  const { cardStyle } = usePhoneSheet();
  const [query, setQuery] = useState("");
  const typed = sanitizePageName(query);

  const rows = useMemo(() => {
    const options = pageParentOptions(pages, page._id);
    const allowed = pages.filter((p) => options.has(p._id));
    return typed
      ? matchPages(allowed, typed, 200).map((p) => ({ page: p, depth: 0 }))
      : pageTreeRows(allowed);
  }, [pages, page._id, typed]);

  const current = page.parentId ?? null;

  return (
    <SheetOverlay onBackdropPress={onClose} zIndex={2000}>
      <DialogCard desktopWidth={420} style={[styles.card, cardStyle]}>
        <DialogHeader title={`Move “${page.name}”`} onClose={onClose} />
        <View style={styles.search}>
          <Ionicons name="search" size={16} color={Colors.textTertiary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Find a page to put it under"
            placeholderTextColor={Colors.textTertiary}
            accessibilityLabel="Find a page to put it under"
            style={[
              styles.searchInput,
              Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
            ]}
          />
        </View>
        <ScrollView
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          accessibilityRole="radiogroup"
        >
          {typed ? null : (
            <Option
              label="Top level"
              icon="albums-outline"
              depth={0}
              selected={current === null}
              onPress={() => onMove(null)}
            />
          )}
          {rows.map(({ page: p, depth }) => (
            <Option
              key={p._id}
              label={p.name}
              icon={PAGE_KIND_ICON[p.kind ?? "other"]}
              depth={depth}
              selected={current === p._id}
              onPress={() => onMove(p._id)}
            />
          ))}
          {typed && rows.length === 0 ? (
            <Text style={styles.quiet}>No page it can go under matches.</Text>
          ) : null}
        </ScrollView>
      </DialogCard>
    </SheetOverlay>
  );
}

function Option({
  label,
  icon,
  depth,
  selected,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  depth: number;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={(state) => [
        styles.row,
        { paddingLeft: 8 + depth * 20 },
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.rowHover,
      ]}
    >
      <Ionicons name={icon} size={16} color={Colors.textSecondary} />
      <Text style={styles.rowName} numberOfLines={1}>
        {label}
      </Text>
      {selected ? (
        <Ionicons name="checkmark" size={18} color={Colors.primary} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { maxHeight: 560 },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 40,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainer,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  list: { flexGrow: 0, flexShrink: 1 },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingRight: 8,
    borderRadius: Radius.md,
  },
  rowHover: { backgroundColor: Colors.surfaceContainerHighest },
  rowName: {
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
});
