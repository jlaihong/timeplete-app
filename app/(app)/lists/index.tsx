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
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../../../components/ui/Card";
import { Button } from "../../../components/ui/Button";
import { Input } from "../../../components/ui/Input";
import { ColorPicker } from "../../../components/ui/ColorPicker";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Stack, router } from "expo-router";

export default function ListsScreen() {
  const lists = useQuery(api.lists.search);
  const upsertList = useMutation(api.lists.upsert);
  const removeList = useMutation(api.lists.remove);
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColour, setNewColour] = useState("#4A90D9");

  const filteredLists = lists
    ?.filter((l) => (showArchived ? l.archived : !l.archived))
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    await upsertList({ name: newName.trim(), colour: newColour });
    setNewName("");
    setCreating(false);
  };

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

      {creating && (
        <Card style={styles.createCard}>
          <Input
            label="List Name"
            value={newName}
            onChangeText={setNewName}
            placeholder="New list name"
          />
          <Text style={styles.colorLabel}>Color</Text>
          <ColorPicker
            selectedColor={newColour}
            onColorSelect={setNewColour}
          />
          <View style={styles.createActions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={() => setCreating(false)}
            />
            <Button title="Create" onPress={handleCreate} />
          </View>
        </Card>
      )}

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
              <TouchableOpacity
                style={styles.listRow}
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
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={Colors.textTertiary}
                />
              </TouchableOpacity>
            </Card>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => setCreating(true)}
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
  createCard: { marginHorizontal: 16, marginBottom: 16 },
  colorLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  createActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    justifyContent: "flex-end",
  },
  listContent: { padding: 16, paddingBottom: 80 },
  listCard: { marginBottom: 6 },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
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
