import React, { useContext } from "react";
import { Text, View, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Id } from "../../convex/_generated/dataModel";
import { ListSharePanel } from "./ListSharePanel";
import { TrackableSharePanel } from "./TrackableSharePanel";
import { DialogOverlay } from "../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../ui/useDialogKeyboardShift";

interface ShareDialogProps {
  type: "list" | "trackable";
  entityId: string;
  onClose: () => void;
}

export function ShareDialog({ type, entityId, onClose }: ShareDialogProps) {
  return (
    // `DialogOverlay` supplies the backdrop, ESC-to-close (web) and — on
    // native — the keyboard shift that keeps the card (with its email
    // input and Close button) above the soft keyboard.
    <DialogOverlay onBackdropPress={onClose} align="center">
      <ShareDialogCard>
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
          <Button
            title="Close"
            variant="outline"
            onPress={onClose}
            size="small"
          />
        </View>
      </ShareDialogCard>
    </DialogOverlay>
  );
}

/**
 * Rendered inside `DialogOverlay` so it can read `DialogMaxHeightContext`
 * — the overlay's keyboard-aware pixel height cap on native.
 */
function ShareDialogCard({ children }: { children: React.ReactNode }) {
  const keyboardMax = useContext(DialogMaxHeightContext);
  return (
    <Card
      style={[
        styles.dialog,
        keyboardMax != null ? { maxHeight: keyboardMax } : null,
      ]}
    >
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  // 92% (not 100%) keeps side insets on phones now that the overlay no
  // longer applies padding.
  dialog: { width: "92%", maxWidth: 400, alignSelf: "center" },
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
    flexShrink: 0,
  },
});
