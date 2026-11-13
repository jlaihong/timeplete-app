import React, { useState } from "react";
import { Alert, Platform, Text, StyleSheet, useWindowDimensions } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Colors, DEFAULT_ENTITY_COLOUR } from "../../constants/colors";
import { FontSize } from "../../theme/tokens";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ColorPicker } from "../ui/ColorPicker";
import {
  DialogOverlay,
  DialogCard,
  DialogHeader,
  DialogFooter,
  DialogMenu,
} from "../ui/DialogScaffold";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";

/**
 * Create or edit a tag. Same shell as every other dialog: name and colour
 * in the body, Cancel and Save in the footer, archive and delete in the
 * header's "more" menu.
 */
export function TagDialog({
  tag,
  onClose,
}: {
  /** The tag being edited, or `null` to create one. */
  tag: Doc<"tags"> | null;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const upsertTag = useMutation(api.tags.upsert);
  const removeTag = useMutation(api.tags.remove);
  const [name, setName] = useState(tag?.name ?? "");
  const [colour, setColour] = useState(tag?.colour ?? DEFAULT_ENTITY_COLOUR);
  const [saving, setSaving] = useState(false);

  const isDirty =
    name !== (tag?.name ?? "") ||
    colour !== (tag?.colour ?? DEFAULT_ENTITY_COLOUR);
  const requestClose = useDiscardGuard(isDirty, onClose);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      await upsertTag({ id: tag?._id, name: trimmed, colour });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const toggleArchived = async () => {
    if (!tag) return;
    await upsertTag({
      id: tag._id,
      name: tag.name,
      colour: tag.colour,
      archived: !tag.archived,
    });
    onClose();
  };

  const confirmDelete = () => {
    if (!tag) return;
    const run = async () => {
      await removeTag({ id: tag._id });
      onClose();
    };
    const message = `Delete the tag "${tag.name}"? It is removed from every task. This cannot be undone.`;
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(message)) void run();
      return;
    }
    Alert.alert("Delete tag", message, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void run() },
    ]);
  };

  return (
    <DialogOverlay
      onBackdropPress={requestClose}
      align={width >= 768 ? "center" : "bottom"}
    >
      <DialogCard desktopWidth={440}>
        <DialogHeader
          title={tag ? "Edit tag" : "New tag"}
          onClose={requestClose}
          headerActions={
            tag ? (
              <DialogMenu
                items={[
                  {
                    label: tag.archived ? "Unarchive tag" : "Archive tag",
                    icon: "archive-outline",
                    onPress: () => void toggleArchived(),
                  },
                  {
                    label: "Delete tag",
                    icon: "trash-outline",
                    onPress: confirmDelete,
                    destructive: true,
                  },
                ]}
              />
            ) : undefined
          }
        />
        <Input
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Tag name"
          autoFocus
          onSubmitEditing={() => void save()}
        />
        <Text style={styles.fieldLabel}>Colour</Text>
        <ColorPicker selectedColor={colour} onColorSelect={setColour} />
        <DialogFooter>
          <Button title="Cancel" variant="ghost" onPress={onClose} size="small" />
          <Button
            title={tag ? "Save" : "Create"}
            onPress={() => void save()}
            loading={saving}
            disabled={!name.trim()}
            size="small"
          />
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  fieldLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 8,
  },
});
