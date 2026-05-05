import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";

interface MemberListProps {
  listId: Id<"lists">;
}

function formatRole(
  permission: "OWNER" | "VIEWER" | "EDITOR",
): string {
  if (permission === "OWNER") return "Owner";
  if (permission === "EDITOR") return "Editor";
  return "Viewer";
}

export function MemberList({ listId }: MemberListProps) {
  const data = useQuery(api.sharing.getListMembers, { listId });
  const updatePermission = useMutation(api.sharing.updateListSharePermission);
  const [updatingShareId, setUpdatingShareId] =
    useState<Id<"listShares"> | null>(null);

  if (!data) return null;

  const { members, viewerIsOwner } = data;

  const notifyError = (message: string) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      window.alert(message);
    } else {
      Alert.alert("Error", message);
    }
  };

  const handleSetPermission = async (
    shareId: Id<"listShares">,
    permission: "VIEWER" | "EDITOR",
  ) => {
    setUpdatingShareId(shareId);
    try {
      await updatePermission({ shareId, permission });
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setUpdatingShareId(null);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Members ({members.length})</Text>
      {members.map((member) => {
        const canEditRole =
          viewerIsOwner && !member.isOwner && Boolean(member.shareId);
        const shareId = member.shareId;

        return (
          <View key={shareId ?? member.userId} style={styles.row}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {member.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{member.name}</Text>
              <Text style={styles.email}>{member.email}</Text>
              {member.shareStatus === "PENDING" ? (
                <Text style={styles.pendingLabel}>Invitation pending</Text>
              ) : null}
            </View>
            {canEditRole && shareId ? (
              <View style={styles.permToggle}>
                <TouchableOpacity
                  style={[
                    styles.permPill,
                    member.permission === "VIEWER" && styles.permPillSelected,
                  ]}
                  disabled={Boolean(updatingShareId)}
                  onPress={() =>
                    member.permission !== "VIEWER"
                      ? void handleSetPermission(shareId, "VIEWER")
                      : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Set role to Viewer"
                >
                  <Text
                    style={[
                      styles.permPillText,
                      member.permission === "VIEWER" &&
                        styles.permPillTextSelected,
                    ]}
                  >
                    Viewer
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.permPill,
                    member.permission === "EDITOR" && styles.permPillSelected,
                  ]}
                  disabled={Boolean(updatingShareId)}
                  onPress={() =>
                    member.permission !== "EDITOR"
                      ? void handleSetPermission(shareId, "EDITOR")
                      : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Set role to Editor"
                >
                  <Text
                    style={[
                      styles.permPillText,
                      member.permission === "EDITOR" &&
                        styles.permPillTextSelected,
                    ]}
                  >
                    Editor
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.badge}>
                {formatRole(member.permission)}
              </Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: Colors.white, fontWeight: "700", fontSize: 14 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "600", color: Colors.text },
  email: { fontSize: 12, color: Colors.textSecondary },
  pendingLabel: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  badge: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textTertiary,
    backgroundColor: Colors.surfaceVariant,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: "hidden",
  },
  permToggle: { flexDirection: "row", gap: 6 },
  permPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: "transparent",
  },
  permPillSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },
  permPillText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  permPillTextSelected: {
    color: Colors.primary,
  },
});
