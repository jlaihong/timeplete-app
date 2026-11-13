import { FontSize } from "../../theme/tokens";
import React, { useContext, useEffect, useRef, useState } from "react";
import {
  StyleSheet,
  Switch,
  Alert,
  Platform,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useVisualViewportHeight } from "../../hooks/useVisualViewportHeight";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors, DEFAULT_ENTITY_COLOUR } from "../../constants/colors";
import { useAuth } from "../../hooks/useAuth";
import { useArchiveList } from "../../hooks/useArchiveList";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TrackablePicker } from "../tasks/TrackablePicker";
import { ListSharePanel } from "../sharing/ListSharePanel";
import {
  DialogOverlay,
  DialogFooter,
  DialogMenu,
  dialogSurfaceStyle,
} from "../ui/DialogScaffold";
import {
  EntityTitle,
  InlineError,
  SectionLabel,
  SettingRow,
} from "../ui/EntityDialogParts";
import { DialogMaxHeightContext } from "../ui/useDialogKeyboardShift";
import { useDiscardGuard } from "../../hooks/useDiscardGuard";

type ListDoc = Doc<"lists"> & { trackableId?: Id<"trackables"> | null };

interface ListDialogProps {
  /**
   * When provided, the dialog opens in edit mode. When omitted, it opens
   * in create mode.
   */
  list?: ListDoc | null;
  onClose: () => void;
  /**
   * When false, the modal is hidden but the component can stay mounted.
   * Prefer this on screens where toggling visibility on react-native-web
   * is flaky if the entire `<Modal>` subtree is mounted/unmounted each time.
   * Defaults to `true` (always show when the component is mounted).
   */
  visible?: boolean;
}

/**
 * Create or edit a list, on one page.
 *
 * The list's name is the dialog title and its colour is the dot beside
 * it. Below sit the settings ("Counts toward", "Show in sidebar") and,
 * for an existing list, who it is shared with.
 *
 * Editing saves as you go: a colour, switch or trackable change is saved
 * at once, the name when you leave the field or press Enter, so the only
 * button is "Done". Creating keeps an explicit "Create".
 *
 * The linked trackable is kept in sync server-side (`setListTrackableLink`
 * in `convex/lists.ts`).
 */
export function ListDialog({
  list,
  onClose,
  visible: visibleProp = true,
}: ListDialogProps) {
  // ESC-to-close is registered by `DialogOverlay` (web) while visible.
  const { height: windowHeight } = useWindowDimensions();
  // On mobile web the layout viewport doesn't shrink when the soft
  // keyboard opens — see `useVisualViewportHeight` for details. Feed
  // the visible height into our size math so the dialog stays fully
  // reachable while a text field is focused.
  const vvHeight = useVisualViewportHeight();
  const effectiveHeight =
    Platform.OS === "web" && vvHeight != null ? vvHeight : windowHeight;
  /** Must match `padding` in `styles.overlay` (24 × 2 vertically). */
  const overlayVerticalPaddingPx = 48;

  const isEditMode = !!list;
  const isInbox = !!list?.isInbox;
  const isGoalList = !!list?.isGoalList;
  const { profile } = useAuth();
  const confirmArchive = useArchiveList();
  const canArchive =
    isEditMode &&
    !!list &&
    !isInbox &&
    profile?._id != null &&
    list.userId === profile._id;

  const [name, setName] = useState(list?.name ?? "");
  const [colour, setColour] = useState(list?.colour ?? DEFAULT_ENTITY_COLOUR);
  const [showInSidebar, setShowInSidebar] = useState(
    list?.showInSidebar ?? true,
  );
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(
    list?.trackableId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Start from the list's values when the dialog opens for a different
  // list. Not on every server update: while editing, the fields here are
  // the source of truth and each change is saved from them.
  const listId = list?._id;
  useEffect(() => {
    setName(list?.name ?? "");
    setColour(list?.colour ?? DEFAULT_ENTITY_COLOUR);
    setShowInSidebar(list?.showInSidebar ?? true);
    setTrackableId(list?.trackableId ?? null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listId, visibleProp]);

  const upsertList = useMutation(api.lists.upsert);
  const removeList = useMutation(api.lists.remove);

  /** The name last saved, to fall back on if the field is left empty. */
  const savedNameRef = useRef(list?.name ?? "");
  useEffect(() => {
    savedNameRef.current = list?.name ?? "";
  }, [list?.name]);

  /** Edit mode: save the current fields, with `patch` applied on top. */
  const saveNow = (patch: {
    name?: string;
    colour?: string;
    showInSidebar?: boolean;
    trackableId?: Id<"trackables"> | null;
  }) => {
    if (!list) return;
    const nextName = (patch.name ?? name).trim() || savedNameRef.current;
    setError(null);
    upsertList({
      id: list._id,
      name: nextName,
      colour: patch.colour ?? colour,
      showInSidebar: patch.showInSidebar ?? showInSidebar,
      // Only touch the trackable link when it is the thing being changed.
      ...(patch.trackableId !== undefined
        ? { trackableId: patch.trackableId }
        : {}),
    }).then(
      () => {
        savedNameRef.current = nextName;
      },
      (e) =>
        setError(
          e instanceof Error ? e.message : "Couldn't save. Try again.",
        ),
    );
  };

  const commitName = () => {
    if (!list || isInbox) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setName(savedNameRef.current);
      return;
    }
    if (trimmed !== savedNameRef.current) saveNow({ name: trimmed });
  };

  /** Close an edit: a name still being typed is saved, not thrown away. */
  const closeEdit = () => {
    commitName();
    onClose();
  };

  const handleCreate = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      await upsertList({
        name: name.trim(),
        colour,
        showInSidebar,
        trackableId: trackableId ?? null,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the list.");
    } finally {
      setSaving(false);
    }
  };

  // Creating: backdrop, Escape and ✕ ask before discarding what was typed.
  const isCreateDirty =
    !isEditMode &&
    (name !== "" ||
      colour !== DEFAULT_ENTITY_COLOUR ||
      !showInSidebar ||
      trackableId !== null);
  const requestCloseCreate = useDiscardGuard(isCreateDirty, onClose);
  const requestClose = isEditMode ? closeEdit : requestCloseCreate;

  const handleDelete = async () => {
    if (!list || isInbox) return;
    const confirmDelete = async () => {
      await removeList({ id: list._id });
      onClose();
    };
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm(`Delete list "${list.name}"?`)) await confirmDelete();
      return;
    }
    Alert.alert("Delete list", `Delete list "${list.name}"?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void confirmDelete() },
    ]);
  };

  /** Approx. title + footer + card padding around the scrolling body. */
  const scrollMaxHeightWeb = Math.max(
    160,
    Math.round(effectiveHeight - 200 - overlayVerticalPaddingPx),
  );

  if (!visibleProp) return null;

  return (
    // `DialogOverlay` supplies the backdrop, ESC-to-close (web), the
    // mobile-web visual-viewport sizing, and — on native — the keyboard
    // shift that keeps the card (and its footer buttons) above the soft
    // keyboard. High zIndex mirrors the previous Modal stacking on web.
    <DialogOverlay onBackdropPress={requestClose} align="center" zIndex={2000}>
      <ListDialogCard>
        <EntityTitle
          name={name}
          onNameChange={setName}
          onNameCommit={isEditMode ? commitName : undefined}
          placeholder="List name"
          nameEditable={!isInbox}
          autoFocus={!isEditMode}
          colour={colour}
          onColourChange={(c) => {
            setColour(c);
            if (isEditMode) saveNow({ colour: c });
          }}
          onClose={requestClose}
          headerActions={
            isEditMode && list ? (
              <DialogMenu
                items={[
                  ...(canArchive
                    ? [
                        {
                          label: list.archived
                            ? "Unarchive list"
                            : "Archive list",
                          icon: "archive-outline" as const,
                          onPress: () =>
                            confirmArchive({
                              _id: list._id,
                              name: list.name,
                              archived: list.archived,
                              onArchived: onClose,
                            }),
                        },
                      ]
                    : []),
                  ...(!isInbox
                    ? [
                        {
                          label: "Delete list",
                          icon: "trash-outline" as const,
                          onPress: handleDelete,
                          destructive: true,
                        },
                      ]
                    : []),
                ]}
              />
            ) : undefined
          }
        />

        <KeyboardAwareScrollView
          style={[
            styles.scroll,
            Platform.OS === "web" && { maxHeight: scrollMaxHeightWeb },
          ]}
          contentContainerStyle={styles.scrollContent}
          // Hide the vertical scrollbar so it doesn't overlap inputs
          // below (RN draws the indicator inside the viewport).
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bottomOffset={120}
        >
          <SettingRow
            label="Counts toward"
            note={
              isGoalList
                ? "Set by the trackable this list belongs to"
                : "Tasks here add to this trackable"
            }
          >
            <TrackablePicker
              inline
              editable={!isGoalList}
              value={trackableId}
              onChange={(id) => {
                setTrackableId(id);
                if (isEditMode) saveNow({ trackableId: id });
              }}
            />
          </SettingRow>
          <SettingRow label="Show in sidebar">
            <Switch
              value={showInSidebar}
              onValueChange={(v) => {
                setShowInSidebar(v);
                if (isEditMode) saveNow({ showInSidebar: v });
              }}
              accessibilityLabel="Show in sidebar"
              trackColor={{
                false: Colors.surfaceContainerHighest,
                true: Colors.primary,
              }}
              thumbColor={Colors.white}
            />
          </SettingRow>

          <InlineError message={error} />

          {isEditMode && list ? (
            <>
              <SectionLabel>Shared with</SectionLabel>
              <ListSharePanel listId={list._id} />
            </>
          ) : null}
        </KeyboardAwareScrollView>

        <DialogFooter>
          {isEditMode ? (
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
                onPress={handleCreate}
                loading={saving}
                disabled={!name.trim()}
                size="small"
              />
            </>
          )}
        </DialogFooter>
      </ListDialogCard>
    </DialogOverlay>
  );
}

/**
 * The dialog surface. A separate component (rendered inside `DialogOverlay`)
 * so it can read `DialogMaxHeightContext` — the overlay's keyboard-aware
 * pixel height cap. That pixel cap also replaces the old percentage
 * `maxHeight` on native, which can't resolve against the overlay's
 * content-sized anchor wrappers.
 */
function ListDialogCard({ children }: { children: React.ReactNode }) {
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
  dialog: {
    ...dialogSurfaceStyle,
    overflow: "hidden",
    // 92% (not 100%) keeps the old Modal-era side insets on phones.
    width: "92%",
    maxWidth: 460,
    maxHeight: "90%",
    ...Platform.select({
      web: { alignSelf: "center", maxHeight: "min(90vh, 90%)" } as object,
      default: {},
    }),
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: "100%",
  },
  scrollContent: { paddingBottom: 4 },
  note: { fontSize: FontSize.caption, color: Colors.textTertiary },
});
