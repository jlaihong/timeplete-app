import React from "react";
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
import { EmptyState } from "../../components/ui/EmptyState";
import { Stack } from "expo-router";
import { DrawerMenuButton } from "../../components/layout/DrawerMenuButton";

export default function SharedScreen() {
  const shared = useQuery(api.sharing.getSharedWithMe, {});
  const acceptShare = useMutation(api.sharing.acceptShare);
  const rejectShare = useMutation(api.sharing.rejectShare);

  if (!shared) {
    return (
      <View style={styles.loading}>
        <Stack.Screen
          options={{
            ...stackHeaderChromeOptions,
            headerShown: true,
            title: "Shared with Me",
            headerLeft: () => <DrawerMenuButton />,
          }}
        />
        <Text>Loading...</Text>
      </View>
    );
  }

  const allItems = [
    ...shared.listShares.map((s) => ({ ...s, type: "list" as const })),
    ...shared.trackableShares.map((s) => ({
      ...s,
      type: "trackable" as const,
    })),
  ];

  const handleAccept = async (shareId: string, type: "list" | "trackable") => {
    await acceptShare({ shareId, shareType: type });
  };

  const handleReject = (shareId: string, type: "list" | "trackable") => {
    Alert.alert("Reject Share", "Are you sure?", [
      { text: "Cancel" },
      {
        text: "Reject",
        style: "destructive",
        onPress: () => rejectShare({ shareId, shareType: type }),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          ...stackHeaderChromeOptions,
          headerShown: true,
          title: "Shared with Me",
          headerLeft: () => <DrawerMenuButton />,
        }}
      />

      {allItems.length === 0 ? (
        <EmptyState
          title="Nothing shared with you"
          message="When someone shares a list or goal with you, it will appear here"
        />
      ) : (
        <FlatList
          data={allItems}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <Card style={styles.shareCard}>
              <View style={styles.shareHeader}>
                <Ionicons
                  name={item.type === "list" ? "list" : "trophy"}
                  size={20}
                  color={Colors.primary}
                />
                <View style={styles.shareInfo}>
                  <Text style={styles.shareName}>
                    {item.type === "list"
                      ? (item as any).listName
                      : (item as any).trackableName}
                  </Text>
                  <Text style={styles.shareOwner}>
                    From: {(item as any).ownerName}
                  </Text>
                </View>
                <Text style={styles.statusBadge}>{item.status}</Text>
              </View>
              <Text style={styles.permission}>
                Permission: {item.permission}
              </Text>
              {item.status === "PENDING" && (
                <View style={styles.actions}>
                  <Button
                    title="Accept"
                    onPress={() => handleAccept(item._id, item.type)}
                    style={styles.acceptBtn}
                  />
                  <Button
                    title="Reject"
                    variant="outline"
                    onPress={() => handleReject(item._id, item.type)}
                  />
                </View>
              )}
            </Card>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16 },
  shareCard: { marginBottom: 12 },
  shareHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  shareInfo: { flex: 1 },
  shareName: { fontSize: 16, fontWeight: "600", color: Colors.text },
  shareOwner: { fontSize: 13, color: Colors.textSecondary },
  statusBadge: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.warning,
    backgroundColor: Colors.warning + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
  permission: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  actions: { flexDirection: "row", gap: 12 },
  acceptBtn: { flex: 1 },
});
