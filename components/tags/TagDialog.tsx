import React, { useRef, useState } from "react";
import { Alert, Platform, StyleSheet, View, useWindowDimensions } from "react-native";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { DEFAULT_ENTITY_COLOUR } from "../../constants/colors";
import { Button } from "../ui/Button";
import { ColorPicker } from "../ui/ColorPicker";
import {
  DialogOverlay,
  DialogCard,
  DialogFooter,
  DialogMenu,
} from "../ui/DialogScaffold";
import {
  EntityTitle,
  InlineError,
  SectionLabel,
} from "../ui/EntityDialogParts";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";

/**
 * Create or edit a tag. Same shape as the list dialog: the name is the
 * title, the dot beside it shows the colour, and editing saves as you go
 * (a colour at once, the name on Enter or when you leave the field), so
 * the only button is "Done". Creating keeps an explicit "Create".
 *
 * A tag's colour is its only setting, so the palette is laid out in the
 * body instead of behind the dot.
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
  const [error, setError] = useState<string | null>(null);
  const savedNameRef = useRef(tag?.name ?? "");

  /** Edit mode: save the current fields, with `patch` applied on top. */
  const saveNow = (patch: { name?: string; colour?: string }) => {
    if (!tag) return;
    const nextName = (patch.name ?? name).trim() || savedNameRef.current;
    setError(null);
    upsertTag({
      id: tag._id,
      name: nextName,
      colour: patch.colour ?? colour,
    }).then(
      () => {
        savedNameRef.current = nextName;
      },
      (e) =>
        setError(e instanceof Error ? e.message : "Couldn't save. Try again."),
    );
  };

  const commitName = () => {
    if (!tag) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setName(savedNameRef.current);
      return;
    }
    if (trimmed !== savedNameRef.current) saveNow({ name: trimmed });
  };

  const closeEdit = () => {
    commitName();
    onClose();
  };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setError(null);
    try {
      await upsertTag({ name: trimmed, colour });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the tag.");
    } finally {
      setSaving(false);
    }
  };

  const isCreateDirty =
    !tag && (name !== "" || colour !== DEFAULT_ENTITY_COLOUR);
  const requestCloseCreate = useDiscardGuard(isCreateDirty, onClose);
  const requestClose = tag ? closeEdit : requestCloseCreate;

  const toggleArchived = async () => {
    if (!tag) return;
    await upsertTag({
      id: tag._id,
      name: savedNameRef.current || tag.name,
      colour,
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
      <DialogCard desktopWidth={460}>
        <EntityTitle
          name={name}
          onNameChange={setName}
          onNameCommit={tag ? commitName : () => void create()}
          placeholder="Tag name"
          autoFocus={!tag}
          colour={colour}
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
        <View style={styles.colours}>
          <SectionLabel>Colour</SectionLabel>
          <ColorPicker
            selectedColor={colour}
            onColorSelect={(c) => {
              setColour(c);
              if (tag) saveNow({ colour: c });
            }}
          />
        </View>
        <InlineError message={error} />
        <DialogFooter>
          {tag ? (
            <Button title="Done" onPress={closeEdit} size="small" />
          ) : (
            <>
              <Button
                title="Cancel"
                variant="ghost"
                onPress={onClose}
                size="small"
              />
              <Button
                title="Create"
                onPress={() => void create()}
                loading={saving}
                disabled={!name.trim()}
                size="small"
              />
            </>
          )}
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  // The section label brings its own top margin; pull it up under the title.
  colours: { marginTop: -12, gap: 4 },
});
