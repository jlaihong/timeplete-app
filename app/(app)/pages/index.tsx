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

/**
 * Pages: everything you can link to with "@". One field both finds a page
 * and makes a new one, the same way the "@" picker does.
 */
export default function PagesScreen() {
  const { pages, loaded } = usePages();
  const createPage = useMutation(api.pages.create);
  const [query, setQuery] = useState("");

  const name = sanitizePageName(query);
  const shown = useMemo(
    () => (name ? matchPages(pages, name, 500) : pages),
    [pages, name],
  );
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
              else if (shown.length === 1) openPage(shown[0]._id);
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

        {shown.map((page) => (
          <Pressable
            key={page._id}
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
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.rowHover,
            ]}
          >
            <Ionicons
              name={PAGE_KIND_ICON[page.kind ?? "other"]}
              size={16}
              color={Colors.textSecondary}
            />
            <Text style={styles.rowName} numberOfLines={1}>
              {page.name}
            </Text>
            {page.kind ? (
              <Text style={styles.rowNote}>{PAGE_KIND_LABEL[page.kind]}</Text>
            ) : null}
          </Pressable>
        ))}

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
  rowName: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  rowNote: { fontSize: FontSize.caption, color: Colors.textTertiary },
});
