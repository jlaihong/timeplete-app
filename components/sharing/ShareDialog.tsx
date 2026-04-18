import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { Id } from "../../convex/_generated/dataModel";

interface ShareDialogProps {
  type: "list" | "trackable";
  entityId: string;
  onClose: () => void;
}

export function ShareDialog({ type, entityId, onClose }: ShareDialogProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [loading, setLoading] = useState(false);

  const shareList = useMutation(api.sharing.shareList);
  const shareTrackable = useMutation(api.sharing.shareTrackable);

  const handleShare = async () => {
    if (!email.trim()) {
      Alert.alert("Error", "Please enter an email address");
      return;
    }

    setLoading(true);
    try {
      if (type === "list") {
        await shareList({
          listId: entityId as Id<"lists">,
          email: email.trim(),
          permission,
        });
      } else {
        await shareTrackable({
          trackableId: entityId as Id<"trackables">,
          email: email.trim(),
          permission,
        });
      }
      Alert.alert("Shared!", "Invite sent successfully");
      onClose();
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to share");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Card style={styles.dialog}>
        <Text style={styles.title}>
          Share {type === "list" ? "List" : "Goal"}
        </Text>

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

        <View style={styles.actions}>
          <Button title="Cancel" variant="outline" onPress={onClose} />
          <Button title="Share" onPress={handleShare} loading={loading} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: { width: "100%", maxWidth: 400 },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 20,
  },
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
  actions: { flexDirection: "row", gap: 12, justifyContent: "flex-end" },
});
