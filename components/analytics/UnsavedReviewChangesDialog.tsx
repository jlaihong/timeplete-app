import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { DialogOverlay } from "../ui/DialogOverlay";
import { DialogCard, DialogFooter, DialogHeader } from "../ui/DialogScaffold";
import { Button } from "../ui/Button";
import { Colors } from "../../constants/colors";

export interface UnsavedReviewChangesDialogProps {
  visible: boolean;
  /** `navigation` shows Save — used when switching analytics tab or date */
  mode: "navigation" | "discard";
  /** Used for DialogHeader close and backdrop (keep edits) */
  onDismiss: () => void;
  onDiscard: () => void | Promise<void>;
  onSave?: () => void | Promise<void>;
  saveDisabled?: boolean;
  saveLoading?: boolean;
  zIndex?: number;
}

/** Shared warning surface for analytics review drafts (web-friendly; no window.confirm). */
export function UnsavedReviewChangesDialog({
  visible,
  mode,
  onDismiss,
  onDiscard,
  onSave,
  saveDisabled,
  saveLoading,
  zIndex = 3400,
}: UnsavedReviewChangesDialogProps) {
  if (!visible) return null;

  const title = "Unsaved changes";
  const message =
    mode === "navigation"
      ? "You have unsaved review answers. Save them before switching the analytics view or date, or discard your edits."
      : "You have unsaved changes. Discard your edits or keep editing.";

  return (
    <DialogOverlay onBackdropPress={onDismiss} zIndex={zIndex}>
      <DialogCard desktopWidth={420}>
        <DialogHeader title={title} onClose={onDismiss} />
        <Text style={styles.body}>{message}</Text>
        <DialogFooter>
          <View style={styles.footerInner}>
            <Button
              title="Discard"
              variant="ghost"
              onPress={() => void onDiscard()}
              size="small"
            />
            <Button
              title="Keep editing"
              variant="ghost"
              onPress={onDismiss}
              size="small"
            />
            {mode === "navigation" && onSave ? (
              <Button
                title="Save"
                variant="primary"
                loading={saveLoading ?? false}
                disabled={saveDisabled ?? saveLoading}
                onPress={() => void onSave()}
                size="small"
              />
            ) : null}
          </View>
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  footerInner: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-end",
    alignItems: "center",
    width: "100%",
  },
});
