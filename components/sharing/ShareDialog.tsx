import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Id } from "../../convex/_generated/dataModel";
import { ListSharePanel } from "./ListSharePanel";
import { TrackableSharePanel } from "./TrackableSharePanel";

interface ShareDialogProps {
  type: "list" | "trackable";
  entityId: string;
  onClose: () => void;
}

export function ShareDialog({ type, entityId, onClose }: ShareDialogProps) {
  return (
    <View style={styles.overlay}>
      <Card style={styles.dialog}>
        <Text style={styles.title}>
          Share {type === "list" ? "List" : "Goal"}
        </Text>

        {type === "list" ? (
          <ListSharePanel
            listId={entityId as Id<"lists">}
            onInviteSent={onClose}
          />
        ) : (
          <TrackableSharePanel
            trackableId={entityId as Id<"trackables">}
            onInviteSent={onClose}
          />
        )}

        <View style={styles.actions}>
          <Button title="Close" variant="outline" onPress={onClose} />
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
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 20,
  },
});
