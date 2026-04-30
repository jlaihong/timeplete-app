import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors, stackHeaderChromeOptions } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { ColorPicker } from "../../components/ui/ColorPicker";
import { EmptyState } from "../../components/ui/EmptyState";
import { Stack } from "expo-router";
import { DrawerMenuButton } from "../../components/layout/DrawerMenuButton";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { DesktopBrandedHeaderTitle } from "../../components/layout/DesktopBrandedHeaderTitle";

export default function TagsScreen() {
  const isDesktop = useIsDesktop();
  const tags = useQuery(api.tags.search);
  const upsertTag = useMutation(api.tags.upsert);
  const removeTag = useMutation(api.tags.remove);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<{
    id?: string;
    name: string;
    colour: string;
  } | null>(null);

  const filteredTags = tags
    ?.filter((t) => (showArchived ? t.archived : !t.archived))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const handleSaveTag = async () => {
    if (!editing || !editing.name.trim()) return;
    await upsertTag({
      id: editing.id as any,
      name: editing.name.trim(),
      colour: editing.colour,
    });
    setEditing(null);
  };

  const handleDeleteTag = (tagId: string) => {
    Alert.alert("Delete Tag", "Are you sure? This cannot be undone.", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeTag({ id: tagId as any }),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...stackHeaderChromeOptions,
          headerShown: true,
          title: "Tags",
          headerLeft: () => <DrawerMenuButton />,
          ...(isDesktop
            ? {
                headerTitleAlign: "left",
                headerTitle: () => <DesktopBrandedHeaderTitle />,
              }
            : {}),
        }}
      />

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

      {editing && (
        <Card style={styles.editCard}>
          <Input
            label="Tag Name"
            value={editing.name}
            onChangeText={(name) => setEditing({ ...editing, name })}
            placeholder="Tag name"
          />
          <Text style={styles.colorLabel}>Color</Text>
          <ColorPicker
            selectedColor={editing.colour}
            onColorSelect={(colour) => setEditing({ ...editing, colour })}
          />
          <View style={styles.editActions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setEditing(null)}
            />
            <Button title="Save" onPress={handleSaveTag} />
          </View>
        </Card>
      )}

      {!filteredTags ? (
        <Text style={styles.loading}>Loading...</Text>
      ) : filteredTags.length === 0 ? (
        <EmptyState
          title="No tags yet"
          message="Create tags to organize your tasks"
        />
      ) : (
        <FlatList
          data={filteredTags}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <Card style={styles.tagCard} padded={false}>
              <TouchableOpacity
                style={styles.tagRow}
                onPress={() =>
                  setEditing({
                    id: item._id,
                    name: item.name,
                    colour: item.colour,
                  })
                }
              >
                <View
                  style={[styles.tagDot, { backgroundColor: item.colour }]}
                />
                <Text style={styles.tagName}>{item.name}</Text>
                <TouchableOpacity
                  onPress={() => handleDeleteTag(item._id)}
                >
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </Card>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setEditing({ name: "", colour: "#4A90D9" })}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
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
  editCard: { marginHorizontal: 16, marginBottom: 16 },
  colorLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  editActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    justifyContent: "flex-end",
  },
  listContent: { padding: 16, paddingBottom: 80 },
  tagCard: { marginBottom: 6 },
  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  tagDot: { width: 14, height: 14, borderRadius: 7 },
  tagName: { flex: 1, fontSize: 15, fontWeight: "500", color: Colors.text },
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
