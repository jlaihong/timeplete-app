import React, { useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  Modal,
  Pressable,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";
import { normalizeListMembersQuery } from "../../lib/listMembersQuery";

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

/** Web anchored menu for Viewer / Editor. */
interface PermMenuAnchored {
  shareId: Id<"listShares">;
  current: "VIEWER" | "EDITOR";
  top: number;
  left: number;
  minWidth: number;
}

function emailsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function MemberList({ listId }: MemberListProps) {
  const data = useQuery(api.sharing.getListMembers, { listId });
  const normalized = normalizeListMembersQuery(data);
  const profile = useQuery(
    api.users.getProfile,
    normalized != null ? {} : "skip",
  );

  const updatePermission = useMutation(api.sharing.updateListSharePermission);
  const [updatingShareId, setUpdatingShareId] =
    useState<Id<"listShares"> | null>(null);
  const [permMenu, setPermMenu] = useState<PermMenuAnchored | null>(null);

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

  const openNativePicker = (
    shareId: Id<"listShares">,
    current: "VIEWER" | "EDITOR",
  ) => {
    Alert.alert(
      "Change permission",
      "Pick a role for this person.",
      [
        {
          text: "Viewer",
          onPress: () => {
            if (current !== "VIEWER") void handleSetPermission(shareId, "VIEWER");
          },
        },
        {
          text: "Editor",
          onPress: () => {
            if (current !== "EDITOR") void handleSetPermission(shareId, "EDITOR");
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const openWebMenu = (
    shareId: Id<"listShares">,
    current: "VIEWER" | "EDITOR",
    anchor: View | null,
  ) => {
    if (!anchor) return;
    anchor.measureInWindow((x, y, width, height) => {
      const minWidth = Math.max(width, 148);
      const vw =
        typeof window !== "undefined" ? window.innerWidth : 400;
      const left = Math.max(
        8,
        Math.min(x, vw - minWidth - 8),
      );
      let top = y + height + 4;
      if (typeof window !== "undefined") {
        const spaceBelow = window.innerHeight - height - y;
        if (spaceBelow < 140 && y > 150) top = Math.max(8, y - 4 - 92);
      }
      setPermMenu({ shareId, current, top, left, minWidth });
    });
  };

  if (!normalized) return null;

  const { members, viewerIsOwner } = normalized;
  const ownerRow = members.find((m) => m.isOwner);
  const inferredOwnerViaProfile =
    ownerRow !== undefined &&
    typeof profile?.email === "string" &&
    profile.email.trim().length > 0 &&
    emailsEqual(profile.email, ownerRow.email);

  const isOwnerViewer = viewerIsOwner === true || inferredOwnerViaProfile;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Members ({members.length})</Text>
      {members.map((member) => {
        const canEditRole =
          isOwnerViewer && !member.isOwner && Boolean(member.shareId);
        const shareId = member.shareId;
        const editablePerm =
          member.permission === "VIEWER" || member.permission === "EDITOR"
            ? member.permission
            : null;

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
            {canEditRole && shareId && editablePerm ? (
              Platform.OS === "web" ? (
                <RoleBadgeDropdownWeb
                  label={formatRole(member.permission)}
                  disabled={Boolean(updatingShareId)}
                  onPressAnchor={(anchor) =>
                    openWebMenu(shareId, editablePerm, anchor)
                  }
                />
              ) : (
                <TouchableOpacity
                  style={[styles.roleBadge, styles.roleBadgeInteractive]}
                  disabled={Boolean(updatingShareId)}
                  onPress={() => openNativePicker(shareId, editablePerm)}
                  accessibilityRole="button"
                  accessibilityLabel="Change permission"
                >
                  <Text style={styles.roleBadgeText}>
                    {formatRole(member.permission)}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={Colors.textSecondary}
                  />
                </TouchableOpacity>
              )
            ) : (
              <Text style={styles.badge}>
                {formatRole(member.permission)}
              </Text>
            )}
          </View>
        );
      })}

      {Platform.OS === "web" ? (
        <Modal
          transparent
          visible={permMenu != null}
          animationType="none"
          onRequestClose={() => setPermMenu(null)}
          presentationStyle="overFullScreen"
        >
          <View style={styles.modalRoot} pointerEvents="box-none">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss permission menu"
              style={styles.menuBackdrop}
              onPress={() => setPermMenu(null)}
            />
            {permMenu ? (
              <View
                style={[
                  styles.menuPanel,
                  {
                    position: "absolute",
                    top: permMenu.top,
                    left: permMenu.left,
                    minWidth: permMenu.minWidth,
                  },
                ]}
                accessibilityViewIsModal
              >
                {(
                  [
                    ["VIEWER" as const, "Viewer"],
                    ["EDITOR" as const, "Editor"],
                  ] as const
                ).map(([perm, label]) => (
                  <Pressable
                    key={perm}
                    style={({ pressed }) => [
                      styles.menuItem,
                      pressed && styles.menuItemPressed,
                      permMenu.current === perm && styles.menuItemSelected,
                    ]}
                    disabled={permMenu.current === perm}
                    onPress={() => {
                      if (permMenu.current !== perm) {
                        void handleSetPermission(permMenu.shareId, perm);
                      }
                      setPermMenu(null);
                    }}
                  >
                    <Text style={styles.menuItemText}>{label}</Text>
                    {permMenu.current === perm ? (
                      <Ionicons
                        name="checkmark"
                        size={18}
                        color={Colors.primary}
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

function RoleBadgeDropdownWeb(props: {
  label: string;
  disabled?: boolean;
  onPressAnchor: (anchor: View | null) => void;
}) {
  const { label, disabled, onPressAnchor } = props;
  const anchorRef = useRef<View | null>(null);

  return (
    <View
      collapsable={false}
      style={[styles.roleBadge, styles.roleBadgeInteractive]}
      ref={(r: View | null) => {
        anchorRef.current = r;
      }}
    >
      <TouchableOpacity
        activeOpacity={0.75}
        disabled={disabled}
        style={[
          styles.roleBadgeInnerTouchable,
          disabled ? styles.opacityDisabled : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Change permission"
        onPress={() => onPressAnchor(anchorRef.current)}
      >
        <Text style={styles.roleBadgeText}>{label}</Text>
        <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
      </TouchableOpacity>
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
  roleBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
    maxWidth: 180,
    alignSelf: "center",
  },
  roleBadgeInteractive: {
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceVariant,
  },
  roleBadgeInnerTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  opacityDisabled: { opacity: 0.55 },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  modalRoot: { flex: 1 },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "transparent" },
  menuPanel: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: 4,
    ...Platform.select({
      web: {
        boxShadow: "0px 8px 24px rgba(0,0,0,0.45)",
      } as object,
      default: {
        elevation: 12,
      },
    }),
    zIndex: 10,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 140,
    gap: 12,
  },
  menuItemPressed: {
    backgroundColor: Colors.surfaceContainerHighest,
  },
  menuItemSelected: {
    backgroundColor: Colors.primary + "18",
  },
  menuItemText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
  },
});
