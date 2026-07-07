import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { View, Text, StyleSheet, TextInput, Platform } from "react-native";
import {
  KeyboardAwareScrollView,
  KeyboardStickyView,
} from "react-native-keyboard-controller";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { TrackablePicker } from "./TrackablePicker";
import { ListPicker } from "./ListPicker";
import { todayYYYYMMDD } from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";
import { useAuth } from "../../hooks/useAuth";
import { useTaskUpsertMutation } from "../../hooks/useTaskUpsertMutation";
import { AutoDismissToast } from "../ui/AutoDismissToast";
import { DialogOverlay } from "../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../ui/useDialogKeyboardShift";
import {
  initialAssignmentStateFromAddTaskContext,
  resolveEffectiveListIdForTaskCreate,
} from "../../lib/addTaskDefaults";

/** Web: force the title clear + toast to hit the DOM before heavy optimistic work runs. */
function flushDialogFeedback(update: () => void) {
  if (Platform.OS === "web") {
    try {
      const { flushSync } = require("react-dom") as typeof import("react-dom");
      flushSync(update);
      return;
    } catch {
      /* non-web bundle without react-dom */
    }
  }
  update();
}

/** Convex optimistic updates run synchronously; yield so cleared title / backdrop can paint first. */
function deferTaskUpsert(run: () => void) {
  setTimeout(run, 0);
}

interface AddTaskSheetProps {
  day?: string;
  listId?: Id<"lists">;
  sectionId?: Id<"listSections">;
  parentId?: Id<"tasks">;
  /**
   * Default trackable when the sheet opens (e.g. list↔goal link). Re-derived on
   * context navigation until the user edits list/trackable assignment.
   */
  defaultTrackableId?: Id<"trackables"> | null;
  /** Hide list picker — keeps tasks on the list/section that opened this sheet. */
  lockListToContext?: boolean;
  onClose: () => void;
}

export function AddTaskSheet({
  day,
  listId: contextualListId,
  sectionId,
  parentId,
  defaultTrackableId,
  lockListToContext = false,
  onClose,
}: AddTaskSheetProps) {
  // ESC-to-close (web) is registered by `DialogOverlay`.
  const { profileReady, profile } = useAuth();
  const titleInputRef = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(() =>
    initialAssignmentStateFromAddTaskContext({
      contextualListId,
      defaultTrackableId,
    }).trackableId,
  );
  // Local manual list selection. `null` here means "no manual list" — on
  // save we fall back to the inbox list (mirrors P1's `AddTask.onSave`).
  const [listId, setListId] = useState<Id<"lists"> | null>(() =>
    initialAssignmentStateFromAddTaskContext({
      contextualListId,
      defaultTrackableId,
    }).listId,
  );

  /** Once the user touches either picker, contextual defaults stop auto-tracking. */
  const assignmentTouchedRef = useRef(false);

  useEffect(() => {
    if (assignmentTouchedRef.current) return;
    const next = initialAssignmentStateFromAddTaskContext({
      contextualListId,
      defaultTrackableId,
    });
    setTrackableId(next.trackableId);
    setListId(next.listId);
  }, [contextualListId, defaultTrackableId]);
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const upsertTask = useTaskUpsertMutation();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const clearToast = useCallback(() => setToastMessage(null), []);

  const showToast = useCallback((msg: string) => {
    setToastKey((k) => k + 1);
    setToastMessage(msg);
  }, []);
  const inboxListId =
    lists?.find((l) => l.isInbox)?._id ?? null;

  const hasGoalSelected = !!trackableId;
  const hideListPicker =
    hasGoalSelected || (!!contextualListId && lockListToContext);

  /** List-detail add dialog: trackable is display-only (productivity-one parity). */
  const lockTrackableAssignment = lockListToContext;

  // Mutual exclusion handlers — verbatim from P1's
  // `onGoalSelectionChange` / `onListSelectionChange`.
  const handleTrackableChange = (id: Id<"trackables"> | null) => {
    if (lockTrackableAssignment) return;
    assignmentTouchedRef.current = true;
    setTrackableId(id);
    if (id) setListId(null);
  };
  const handleListChange = (id: Id<"lists"> | null) => {
    assignmentTouchedRef.current = true;
    setListId(id);
    if (id) setTrackableId(null);
  };

  const handleCreate = () => {
    const title = name.trim();
    if (!title) return;

    // P1 ordering, extended so list-detail (`lockListToContext`) always passes the
    // page list id when appropriate — Convex + optimistic list pagination rely on it.
    const effectiveListId = resolveEffectiveListIdForTaskCreate({
      trackableId,
      lockListToContext,
      contextualListId,
      explicitListId: listId,
      inboxListId,
    });

    flushDialogFeedback(() => {
      setName("");
      showToast("Task added");
    });

    const payload = {
      name: title,
      taskDay: day ?? todayYYYYMMDD(),
      listId: effectiveListId,
      sectionId,
      parentId,
      trackableId: trackableId ?? undefined,
      clientViewerUserId:
        profileReady && profile ? profile._id : undefined,
    };

    deferTaskUpsert(() => {
      void upsertTask(payload).catch((err) => {
        console.error("[AddTaskSheet] Failed to create task:", err);
        showToast("Could not create task");
      });
      queueMicrotask(() => titleInputRef.current?.focus());
    });
  };

  return (
    <>
      {/* `DialogOverlay` supplies the backdrop, ESC-to-close (web), the
       * mobile-web visual-viewport sizing, and — on native — the keyboard
       * shift that keeps the card (and its footer buttons) above the soft
       * keyboard. */}
      <DialogOverlay onBackdropPress={onClose} align="center">
        <AddTaskCard>
          <KeyboardAwareScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bottomOffset={80}
            // Hide the vertical scrollbar so it doesn't paint on top of the
            // rounded right edge of the inputs/pickers below it (RN draws
            // the indicator inside the scroll viewport, not outside it).
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>
              {parentId ? "Add Subtask" : "Add Task"}
            </Text>

            <Input
              ref={titleInputRef}
              label="Task Name"
              value={name}
              onChangeText={setName}
              placeholder="What needs to be done?"
              autoFocus
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={handleCreate}
            />

            <TrackablePicker
              value={trackableId}
              onChange={handleTrackableChange}
              editable={!lockTrackableAssignment}
            />

            {/* List picker hidden when a trackable is selected, or list context locks the roster. */}
            {!hideListPicker && (
              <ListPicker
                value={listId}
                onChange={handleListChange}
                mode="add"
              />
            )}
          </KeyboardAwareScrollView>

          {/* Fixed footer (outside the scroll) so Cancel/Create stay
           * visible while the keyboard is up and the card is
           * height-capped. */}
          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="outline"
              onPress={onClose}
              size="small"
            />
            <Button title="Create" onPress={handleCreate} size="small" />
          </View>
        </AddTaskCard>
      </DialogOverlay>
      {/**
       * `KeyboardStickyView` (from react-native-keyboard-controller) tracks
       * the software keyboard on iOS/Android and translates its child up
       * by the keyboard height. Without it, the toast sits at the screen
       * bottom and is completely hidden while the keyboard is open — the
       * user never sees "Task added". On web it's a no-op; there the
       * overlay already tracks the visible viewport, so the toast lands
       * above the keyboard. Rendered as a SIBLING of the overlay so the
       * card's keyboard lift doesn't double-shift it.
       */}
      <KeyboardStickyView style={styles.toastLayer} pointerEvents="box-none">
        <AutoDismissToast key={toastKey} message={toastMessage} onDismiss={clearToast} />
      </KeyboardStickyView>
    </>
  );
}

/**
 * Rendered inside `DialogOverlay` so it can read `DialogMaxHeightContext`
 * — the overlay's keyboard-aware pixel height cap on native.
 */
function AddTaskCard({ children }: { children: React.ReactNode }) {
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
    // 92% (not 100%) keeps the old overlay-padding side insets on phones.
    width: "92%",
    maxWidth: 420,
    maxHeight: "85%",
    alignSelf: "center",
    overflow: "hidden",
  },
  // `flexShrink: 1` (RN default 0) lets the form give up height when the
  // card is height-capped (keyboard open); content beyond that scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
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
    marginTop: 8,
    flexShrink: 0,
  },
  // Pins the toast to the visible area (or above the keyboard, via
  // `KeyboardStickyView`). `pointerEvents: "box-none"` lets taps flow
  // through to the backdrop below.
  toastLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
  },
});
