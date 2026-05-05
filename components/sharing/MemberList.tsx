import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Id } from "../../convex/_generated/dataModel";
import { normalizeListMembersQuery } from "../../lib/listMembersQuery";
import { renderListPermissionPortal } from "./listPermissionPortal";

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

function emailsEqual(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

interface PermMenuAnchored {
  collaboratorUserId: Id<"users">;
  current: "VIEWER" | "EDITOR";
  top: number;
  left: number;
  minWidth: number;
}

export function MemberList({ listId }: MemberListProps) {
  const data = useQuery(api.sharing.getListMembers, { listId });
  const normalized = normalizeListMembersQuery(data);
  const profile = useQuery(
    api.users.getProfile,
    normalized != null ? {} : "skip",
  );
  const myOwnedLists = useQuery(api.lists.search, normalized != null ? {} : "skip");

  const setCollaboratorPermission = useMutation(
    api.sharing.updateListCollaboratorPermission,
  );
  const [updatingCollaboratorUserId, setUpdatingCollaboratorUserId] =
    useState<Id<"users"> | null>(null);
  const [permMenu, setPermMenu] = useState<PermMenuAnchored | null>(null);

  useEffect(() => {
    if (Platform.OS !== "web" || !permMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPermMenu(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [permMenu]);

  const notifyError = (message: string) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      window.alert(message);
    } else {
      Alert.alert("Error", message);
    }
  };

  const handleSetPermission = async (
    collaboratorUserId: Id<"users">,
    permission: "VIEWER" | "EDITOR",
  ) => {
    setUpdatingCollaboratorUserId(collaboratorUserId);
    try {
      await setCollaboratorPermission({
        listId,
        collaboratorUserId,
        permission,
      });
    } catch (e: unknown) {
      notifyError(e instanceof Error ? e.message : "Could not update role");
    } finally {
      setUpdatingCollaboratorUserId(null);
    }
  };

  const openNativePicker = (
    collaboratorUserId: Id<"users">,
    current: "VIEWER" | "EDITOR",
  ) => {
    Alert.alert(
      "Change permission",
      "Pick a role for this person.",
      [
        {
          text: "Viewer",
          onPress: () => {
            if (current !== "VIEWER") {
              void handleSetPermission(collaboratorUserId, "VIEWER");
            }
          },
        },
        {
          text: "Editor",
          onPress: () => {
            if (current !== "EDITOR") {
              void handleSetPermission(collaboratorUserId, "EDITOR");
            }
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
      { cancelable: true },
    );
  };

  const openWebMenu = (
    collaboratorUserId: Id<"users">,
    current: "VIEWER" | "EDITOR",
    anchor: View | null,
  ) => {
    if (!anchor) return;
    anchor.measureInWindow((x, y, width, height) => {
      const minWidth = Math.max(width, 160);
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
      setPermMenu({ collaboratorUserId, current, top, left, minWidth });
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

  const isOwnerViaMyLists =
    myOwnedLists !== undefined &&
    myOwnedLists.some((l) => l._id === listId);

  const isOwnerViewer =
    viewerIsOwner === true || inferredOwnerViaProfile || isOwnerViaMyLists;

  const hasCollaborators = members.some((m) => !m.isOwner);

  const busyUpdating = updatingCollaboratorUserId !== null;

  const webPortal =
    permMenu != null
      ? renderListPermissionPortal({
          permMenu: {
            collaboratorUserId: permMenu.collaboratorUserId,
            current: permMenu.current,
            top: permMenu.top,
            left: permMenu.left,
            minWidth: permMenu.minWidth,
          },
          busyUpdating,
          onDismiss: () => setPermMenu(null),
          onPick: (perm) => {
            if (permMenu.current !== perm) {
              void handleSetPermission(permMenu.collaboratorUserId, perm);
            }
            setPermMenu(null);
          },
        })
      : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Members ({members.length})</Text>

      {isOwnerViewer && hasCollaborators ? (
        <Text style={styles.ownerHint}>
          Tap a collaborator&apos;s role (Viewer / Editor) to change their
          permission.
        </Text>
      ) : null}

      {members.map((member) => {
        const editablePerm =
          member.permission === "VIEWER" || member.permission === "EDITOR"
            ? member.permission
            : null;

        const canEditRole =
          Boolean(isOwnerViewer) &&
          !member.isOwner &&
          editablePerm != null &&
          !busyUpdating;

        return (
          <View key={member.userId} style={styles.row}>
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
            {canEditRole && editablePerm ? (
              Platform.OS === "web" ? (
                <RoleBadgeDropdownWeb
                  label={formatRole(member.permission)}
                  disabled={busyUpdating}
                  onPressAnchor={(anchor) =>
                    openWebMenu(member.userId, editablePerm, anchor)
                  }
                />
              ) : (
                <TouchableOpacity
                  style={[styles.roleBadge, styles.roleBadgeInteractive]}
                  disabled={busyUpdating}
                  onPress={() =>
                    openNativePicker(member.userId, editablePerm)
                  }
                  accessibilityRole="button"
                  accessibilityHint="Opens options to choose Viewer or Editor"
                  accessibilityLabel="Change permission"
                >
                  <Text style={styles.roleBadgeText}>
                    {formatRole(member.permission)}
                  </Text>
                  <Ionicons
                    name="chevron-down"
                    size={14}
                    color={Colors.primary}
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
      {webPortal}
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
        accessibilityHint="Opens a menu to choose Viewer or Editor"
        accessibilityLabel="Change permission"
        onPress={() => onPressAnchor(anchorRef.current)}
      >
        <Text style={[styles.roleBadgeText, styles.roleBadgeLabelWeb]}>
          {label}
        </Text>
        <Ionicons name="chevron-down" size={16} color={Colors.primary} />
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
  ownerHint: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textSecondary,
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
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerHighest,
    maxWidth: 200,
    alignSelf: "center",
    minHeight: 36,
    justifyContent: "center",
  },
  roleBadgeInteractive: {},
  roleBadgeInnerTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  opacityDisabled: { opacity: 0.55 },
  roleBadgeText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  roleBadgeLabelWeb: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: "700",
  },
});
