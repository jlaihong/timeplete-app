import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { MemberList } from "./MemberList";

interface ListSharePanelProps {
  listId: Id<"lists">;
  /** e.g. close parent ShareDialog after success */
  onInviteSent?: () => void;
}

/**
 * List invite + members — embedded in Edit List (sharing tab) or ShareDialog.
 */
export function ListSharePanel({ listId, onInviteSent }: ListSharePanelProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [loading, setLoading] = useState(false);

  const shareList = useMutation(api.sharing.shareList);

  const handleShare = async () => {
    if (!email.trim()) {
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("Please enter an email address");
      } else {
        Alert.alert("Error", "Please enter an email address");
      }
      return;
    }

    setLoading(true);
    try {
      await shareList({
        listId,
        email: email.trim(),
        permission,
      });
      setEmail("");
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert("Invite sent successfully");
      } else {
        Alert.alert("Shared!", "Invite sent successfully");
      }
      onInviteSent?.();
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : "Failed to share";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(message);
      } else {
        Alert.alert("Error", message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>People with access</Text>
      <MemberList listId={listId} />
      <Text style={[styles.sectionTitle, styles.inviteHeading]}>
        Invite someone
      </Text>
      <Input
        label="Email address"
        value={email}
        onChangeText={setEmail}
        placeholder="colleague@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
      />

      <Text style={styles.permLabel}>Permission</Text>
      <View style={styles.permRow}>
        <TouchableOpacity
          style={[
            styles.permOption,
            permission === "VIEWER" && styles.permSelected,
          ]}
          onPress={() => setPermission("VIEWER")}
        >
          <Text
            style={[
              styles.permText,
              permission === "VIEWER" && styles.permTextSelected,
            ]}
          >
            Viewer
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.permOption,
            permission === "EDITOR" && styles.permSelected,
          ]}
          onPress={() => setPermission("EDITOR")}
        >
          <Text
            style={[
              styles.permText,
              permission === "EDITOR" && styles.permTextSelected,
            ]}
          >
            Editor
          </Text>
        </TouchableOpacity>
      </View>

      <Button title="Send invite" onPress={handleShare} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  inviteHeading: {
    marginTop: 20,
  },
  permLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
    marginTop: 4,
  },
  permRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  permOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
  },
  permSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + "10",
  },
  permText: { fontSize: 14, fontWeight: "500", color: Colors.textSecondary },
  permTextSelected: { color: Colors.primary },
});
