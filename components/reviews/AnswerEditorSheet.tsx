/**
 * Full-screen answer editor for review questions on native.
 *
 * Inline multiline inputs are a poor writing surface on phones: the soft
 * keyboard covers most of the screen and the focused box is small or
 * half-hidden. This editor gives one question the entire screen — it is a
 * real `Modal`, so it renders in its own native window above the app
 * chrome (navigation header, timer bar, and the app-wide KeyboardToolbar
 * are all covered). The question stays pinned at the top and the text
 * input fills everything between it and the keyboard.
 *
 * Keyboard: the footer and input bottom are lifted with `paddingBottom`
 * driven by `useKeyboardState` (react-native-keyboard-controller's global
 * keyboard watcher still fires inside a Modal). The KeyboardToolbar lives
 * in the app's root window, so no toolbar height compensation is needed
 * here — the keyboard is the only intrusion.
 */

import React, { useState } from "react";
import {
  Alert,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useKeyboardState } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { DialogFooter, DialogHeader } from "../ui/DialogScaffold";

interface AnswerEditorSheetProps {
  questionText: string;
  initialText: string;
  /** Close without saving (after the discard guard, if dirty). */
  onCancel: () => void;
  /** Commit the edited text. The editor closes immediately; persistence is the caller's job. */
  onDone: (text: string) => void;
}

export function AnswerEditorSheet({
  questionText,
  initialText,
  onCancel,
  onDone,
}: AnswerEditorSheetProps) {
  const [text, setText] = useState(initialText);
  const insets = useSafeAreaInsets();
  const keyboardHeight = useKeyboardState((s) => (s.isVisible ? s.height : 0));

  const isDirty = text !== initialText;

  const requestCancel = () => {
    if (!isDirty) {
      onCancel();
      return;
    }
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Discard your changes to this answer?")) onCancel();
      return;
    }
    Alert.alert("Discard changes?", "Your edits to this answer will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: onCancel },
    ]);
  };

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={requestCancel}
      statusBarTranslucent
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + 8,
            paddingBottom:
              keyboardHeight > 0
                ? keyboardHeight + 8
                : Math.max(insets.bottom, 12),
          },
        ]}
      >
        <DialogHeader title={questionText} onClose={requestCancel} />
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Your answer..."
          placeholderTextColor={Colors.textTertiary}
          multiline
          textAlignVertical="top"
          autoFocus
          scrollEnabled
        />
        <DialogFooter>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={requestCancel}
            size="small"
          />
          <Button title="Done" onPress={() => onDone(text)} size="small" />
        </DialogFooter>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: 20,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainer,
  },
});
