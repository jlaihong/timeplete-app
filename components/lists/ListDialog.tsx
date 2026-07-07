import React, { useContext, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
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
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ColorPicker } from "../ui/ColorPicker";
import { Card } from "../ui/Card";
import { TrackablePicker } from "../tasks/TrackablePicker";
import { ListSharePanel } from "../sharing/ListSharePanel";
import { DialogOverlay } from "../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../ui/useDialogKeyboardShift";

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
 * Mirrors productivity-one's `list-dialog`: a single dialog used for both
 * creating and editing a list, with fields for Name, Colour, "Linked
 * Trackable" (the headline feature requested here), and "Show in sidebar".
 *
 * The "Linked Trackable" picker reuses our existing `TrackablePicker`
 * (the same control surfaced on tasks). Backend-side, `lists.upsert`
 * keeps `listTrackableLinks` and `trackable.listId` in sync — see the
 * `setListTrackableLink` helper in `convex/lists.ts`.
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

  const [name, setName] = useState(list?.name ?? "");
  const [colour, setColour] = useState(list?.colour ?? "#4A90D9");
  const [showInSidebar, setShowInSidebar] = useState(
    list?.showInSidebar ?? true,
  );
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(
    list?.trackableId ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"details" | "sharing">(
    "details",
  );

  // Refresh form state if the parent re-opens the dialog with a different list.
  useEffect(() => {
    setName(list?.name ?? "");
    setColour(list?.colour ?? "#4A90D9");
    setShowInSidebar(list?.showInSidebar ?? true);
    setTrackableId(list?.trackableId ?? null);
    setDetailsTab("details");
  }, [list?._id, list?.name, list?.colour, list?.showInSidebar, list?.trackableId]);

  const upsertList = useMutation(api.lists.upsert);
  const removeList = useMutation(api.lists.remove);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await upsertList({
        id: list?._id,
        name: name.trim(),
        colour,
        showInSidebar,
        // `null` explicitly clears the link; `undefined` would leave it alone.
        trackableId: trackableId ?? null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

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

  /** Approx. title/tabs/footer + inner card padding (`theme/panels` 16 × 2 + gaps). */
  const webBodyChromeReservePx =
    (isEditMode && list ? 296 : 220) + overlayVerticalPaddingPx;
  const scrollMaxHeightWeb = Math.max(
    160,
    Math.round(effectiveHeight - webBodyChromeReservePx),
  );

  if (!visibleProp) return null;

  return (
    // `DialogOverlay` supplies the backdrop, ESC-to-close (web), the
    // mobile-web visual-viewport sizing, and — on native — the keyboard
    // shift that keeps the card (and its footer buttons) above the soft
    // keyboard. High zIndex mirrors the previous Modal stacking on web.
    <DialogOverlay onBackdropPress={onClose} align="center" zIndex={2000}>
      <ListDialogCard>
            <Text style={styles.title}>
              {isEditMode ? "Edit List" : "Create List"}
            </Text>

            {isEditMode && list ? (
              <View style={styles.tabsRow}>
                <Pressable
                  style={[
                    styles.tab,
                    detailsTab === "details" && styles.tabActive,
                  ]}
                  onPress={() => setDetailsTab("details")}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      detailsTab === "details" && styles.tabLabelActive,
                    ]}
                  >
                    Details
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.tab,
                    detailsTab === "sharing" && styles.tabActive,
                  ]}
                  onPress={() => setDetailsTab("sharing")}
                >
                  <Text
                    style={[
                      styles.tabLabel,
                      detailsTab === "sharing" && styles.tabLabelActive,
                    ]}
                  >
                    Sharing
                  </Text>
                </Pressable>
              </View>
            ) : null}

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
              {isEditMode && list && detailsTab === "sharing" ? (
                <ListSharePanel listId={list._id} />
              ) : (
                <>
                  <Input
                    label="Name"
                    value={name}
                    onChangeText={setName}
                    placeholder="List name"
                    editable={!isInbox}
                  />

                  <Text style={styles.fieldLabel}>Colour</Text>
                  <ColorPicker
                    selectedColor={colour}
                    onColorSelect={setColour}
                  />

                  {isGoalList ? (
                    <View style={styles.notice}>
                      <Text style={styles.noticeText}>
                        This is a goal list. Its linked trackable is managed
                        automatically and can&apos;t be changed here.
                      </Text>
                    </View>
                  ) : (
                    <TrackablePicker
                      label="Linked Trackable"
                      value={trackableId}
                      onChange={setTrackableId}
                    />
                  )}

                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Show in sidebar</Text>
                    <Switch
                      value={showInSidebar}
                      onValueChange={setShowInSidebar}
                      trackColor={{
                        false: Colors.surfaceContainerHigh,
                        true: Colors.primary,
                      }}
                      thumbColor={Colors.white}
                    />
                  </View>
                </>
              )}
            </KeyboardAwareScrollView>

            {isEditMode && list && detailsTab === "sharing" ? (
              <View
                style={[styles.actionsRow, styles.actionsRowSharing, styles.actionsFooter]}
              >
                <View style={styles.spacer} />
                <View style={styles.primaryActions}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={onClose}
                    size="small"
                  />
                </View>
              </View>
            ) : (
              <View style={[styles.actionsRow, styles.actionsFooter]}>
                {isEditMode && !isInbox ? (
                  <Button
                    title="Delete"
                    variant="danger"
                    onPress={handleDelete}
                    style={styles.deleteButton}
                    size="small"
                  />
                ) : (
                  <View style={styles.spacer} />
                )}
                <View style={styles.primaryActions}>
                  <Button
                    title="Cancel"
                    variant="outline"
                    onPress={onClose}
                    size="small"
                  />
                  <Button
                    title={isEditMode ? "Save" : "Create"}
                    onPress={handleSave}
                    loading={saving}
                    disabled={!name.trim()}
                    size="small"
                  />
                </View>
              </View>
            )}
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
    // 92% (not 100%) keeps the old Modal-era side insets on phones.
    width: "92%",
    maxWidth: 440,
    maxHeight: "90%",
    ...Platform.select({
      web: { alignSelf: "center", maxHeight: "min(90vh, 90%)" } as object,
      default: {},
    }),
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 16,
  },
  tabsRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    marginBottom: 12,
    gap: 4,
  },
  tab: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: -StyleSheet.hairlineWidth,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  tabLabelActive: {
    color: Colors.primary,
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: "100%",
  },
  scrollContent: { paddingBottom: 8 },
  fieldLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    fontWeight: "500",
    marginBottom: 6,
    marginTop: 4,
  },
  notice: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    marginTop: 8,
  },
  noticeText: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 4,
  },
  toggleLabel: { fontSize: 14, color: Colors.text, fontWeight: "500" },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    gap: 12,
  },
  /** Keep Save/Cancel inside the card when the scroll body is height-capped on web. */
  actionsFooter: {
    flexShrink: 0,
  },
  actionsRowSharing: {
    justifyContent: "flex-end",
  },
  spacer: { flex: 0 },
  deleteButton: { paddingHorizontal: 14 },
  primaryActions: {
    flexDirection: "row",
    gap: 12,
    marginLeft: "auto",
  },
});
