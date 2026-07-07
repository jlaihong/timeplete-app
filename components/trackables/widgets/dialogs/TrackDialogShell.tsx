/**
 * Shared chrome for the four Track* logging dialogs (tracker / time /
 * periodic / count).
 *
 * `DialogOverlay` supplies the backdrop, ESC-to-close (web), mobile-web
 * visual-viewport sizing, and — on native — the keyboard shift that lifts
 * the card above the soft keyboard (see `useDialogKeyboardShift`).
 *
 * The action buttons render OUTSIDE the scroll region as a fixed footer:
 * with the card height-capped while the keyboard is up, the scroll body
 * (`flexShrink: 1`) gives up height and Cancel/Save stay visible instead
 * of being pushed behind the keyboard.
 */
import React, { useContext } from "react";
import { View, StyleSheet, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Card } from "../../../ui/Card";
import { DialogOverlay } from "../../../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../../../ui/useDialogKeyboardShift";

interface TrackDialogShellProps {
  onClose: () => void;
  /** Card width cap — mirrors each dialog's previous `dialogWrap` width. */
  maxWidth?: number;
  /** Scrollable dialog body. */
  children: React.ReactNode;
  /** Fixed footer content (Cancel / Save buttons). */
  actions: React.ReactNode;
}

export function TrackDialogShell({
  onClose,
  maxWidth = 480,
  children,
  actions,
}: TrackDialogShellProps) {
  return (
    <DialogOverlay onBackdropPress={onClose} align="center">
      <ShellCard maxWidth={maxWidth}>
        <KeyboardAwareScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={100}
          // Hide the vertical scrollbar so it doesn't overlap inputs
          // below (RN draws the indicator inside the viewport).
          showsVerticalScrollIndicator={false}
        >
          {children}
        </KeyboardAwareScrollView>
        <View style={styles.actions}>{actions}</View>
      </ShellCard>
    </DialogOverlay>
  );
}

/**
 * Rendered inside `DialogOverlay` so it can read `DialogMaxHeightContext`
 * — the overlay's keyboard-aware pixel height cap on native (percentages
 * can't resolve against the overlay's content-sized anchor wrappers).
 */
function ShellCard({
  maxWidth,
  children,
}: {
  maxWidth: number;
  children: React.ReactNode;
}) {
  const keyboardMax = useContext(DialogMaxHeightContext);
  return (
    <Card
      style={[
        styles.dialog,
        { maxWidth },
        keyboardMax != null ? { maxHeight: keyboardMax } : null,
      ]}
    >
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  dialog: {
    // 92% (not 100%) keeps the old overlay-padding side insets on phones.
    width: "92%",
    alignSelf: "center",
    // Clip overflowing content to the rounded card (parity with DialogCard).
    overflow: "hidden",
    ...Platform.select({
      web: { maxHeight: "85%" } as object,
      default: {},
    }),
  },
  // `flexShrink: 1` (RN default 0) lets the body give up height when the
  // card is height-capped (keyboard open); content beyond that scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 12,
    flexShrink: 0,
  },
});
