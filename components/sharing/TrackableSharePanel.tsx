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

interface TrackableSharePanelProps {
  trackableId: Id<"trackables">;
  onInviteSent?: () => void;
}

export function TrackableSharePanel({
  trackableId,
  onInviteSent,
}: TrackableSharePanelProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [loading, setLoading] = useState(false);

  const shareTrackable = useMutation(api.sharing.shareTrackable);

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
      await shareTrackable({
        trackableId,
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
      <Input
        label="Email Address"
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

      <Button title="Share" onPress={handleShare} loading={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  permLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  permRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
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
