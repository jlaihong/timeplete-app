import { FontSize, Radius } from "../../theme/tokens";
import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { MemberList } from "./MemberList";

interface ListSharePanelProps {
  listId: Id<"lists">;
  /** e.g. close parent ShareDialog after success */
  onInviteSent?: () => void;
}

type Permission = "VIEWER" | "EDITOR";

/**
 * Who a list is shared with, and one line to invite someone: email, role,
 * "Invite". Used inside the list dialog and the standalone ShareDialog.
 * The result of an invite is said under the line rather than in an alert.
 */
export function ListSharePanel({ listId, onInviteSent }: ListSharePanelProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<Permission>("VIEWER");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  const shareList = useMutation(api.sharing.shareList);

  const handleShare = async () => {
    const address = email.trim();
    if (!address || loading) return;
    setLoading(true);
    setStatus(null);
    try {
      await shareList({ listId, email: address, permission });
      setEmail("");
      setStatus({ text: `Invite sent to ${address}`, isError: false });
      onInviteSent?.();
    } catch (e: unknown) {
      setStatus({
        text: e instanceof Error ? e.message : "Couldn't send the invite",
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <MemberList listId={listId} />

      <View style={styles.inviteRow}>
        <TextInput
          value={email}
          onChangeText={(text) => {
            setEmail(text);
            if (status) setStatus(null);
          }}
          onSubmitEditing={() => void handleShare()}
          placeholder="Invite by email"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Email address to invite"
          style={[
            styles.email,
            Platform.OS === "web" ? ({ outlineStyle: "none" } as object) : null,
          ]}
        />
        <View style={styles.roles} accessibilityRole="radiogroup">
          {(["VIEWER", "EDITOR"] as Permission[]).map((p) => {
            const selected = permission === p;
            return (
              <Pressable
                key={p}
                onPress={() => setPermission(p)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                style={[styles.role, selected && styles.roleSelected]}
              >
                <Text
                  style={[styles.roleText, selected && styles.roleTextSelected]}
                >
                  {p === "VIEWER" ? "Viewer" : "Editor"}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Button
          title="Invite"
          size="small"
          onPress={() => void handleShare()}
          loading={loading}
          disabled={!email.trim()}
        />
      </View>
      {status ? (
        <Text
          style={[styles.status, status.isError && styles.statusError]}
          accessibilityLiveRegion="polite"
        >
          {status.text}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inviteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  email: {
    flex: 1,
    minWidth: 150,
    height: 36,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outline,
    backgroundColor: Colors.surfaceContainer,
    fontSize: FontSize.body,
    color: Colors.text,
  },
  roles: {
    flexDirection: "row",
    padding: 2,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainer,
  },
  role: {
    height: 32,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    justifyContent: "center",
  },
  roleSelected: { backgroundColor: Colors.surfaceContainerHighest },
  roleText: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  roleTextSelected: { color: Colors.text },
  status: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginTop: 6,
  },
  statusError: { color: Colors.error },
});
