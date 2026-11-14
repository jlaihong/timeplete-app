import { FontSize } from "../../theme/tokens";
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
import {
  DialogOverlay,
  DialogHeader,
  DialogFooter,
  dialogSurfaceStyle,
} from "../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../ui/useDialogKeyboardShift";
import {
  initialAssignmentStateFromAddTaskContext,
  normalizeTrackableOverride,
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
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const inboxListId = lists?.find((l) => l.isInbox)?._id ?? null;

  /** Trackable the list the dialog was opened from is linked to, if any. */
  const contextualListTrackableId =
    ((lists?.find((l) => l._id === contextualListId)?.trackableId ??
      null) as Id<"trackables"> | null);

  const initialAssignment = () =>
    initialAssignmentStateFromAddTaskContext({
      contextualListId,
      defaultTrackableId,
      contextualListTrackableId,
    });

  /** Explicit "counts toward" override; `null` follows the list. */
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(
    () => initialAssignment().trackableId,
  );
  /** Picked list; `null` means Inbox. */
  const [listId, setListId] = useState<Id<"lists"> | null>(
    () => initialAssignment().listId,
  );

  /** Once the user touches either picker, contextual defaults stop auto-tracking. */
  const assignmentTouchedRef = useRef(false);

  useEffect(() => {
    if (assignmentTouchedRef.current) return;
    const next = initialAssignment();
    setTrackableId(next.trackableId);
    setListId(next.listId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextualListId, defaultTrackableId, contextualListTrackableId]);
  const upsertTask = useTaskUpsertMutation();

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastKey, setToastKey] = useState(0);
  const clearToast = useCallback(() => setToastMessage(null), []);

  const showToast = useCallback((msg: string) => {
    setToastKey((k) => k + 1);
    setToastMessage(msg);
  }, []);

  /** The list is fixed when the dialog was opened from a list page. */
  const hideListPicker = !!contextualListId && lockListToContext;

  /** List the task will be created in — drives the inherited trackable. */
  const effectiveListId = resolveEffectiveListIdForTaskCreate({
    lockListToContext,
    contextualListId,
    explicitListId: listId,
    inboxListId,
  });
  const inheritedTrackableId =
    ((lists?.find((l) => l._id === effectiveListId)?.trackableId ??
      null) as Id<"trackables"> | null);

  // List and trackable are independent: the list is where the task lives,
  // the trackable is what it counts toward.
  const handleTrackableChange = (id: Id<"trackables"> | null) => {
    assignmentTouchedRef.current = true;
    setTrackableId(normalizeTrackableOverride(id, inheritedTrackableId));
  };
  const handleListChange = (id: Id<"lists"> | null) => {
    assignmentTouchedRef.current = true;
    setListId(id);
  };

  const handleCreate = () => {
    const title = name.trim();
    if (!title) return;

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
          <DialogHeader
            title={parentId ? "Add subtask" : "Add task"}
            onClose={onClose}
          />
          <KeyboardAwareScrollView
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
            bottomOffset={80}
            // Hide the vertical scrollbar so it doesn't paint on top of the
            // rounded right edge of the inputs/pickers below it (RN draws
            // the indicator inside the scroll viewport, not outside it).
            showsVerticalScrollIndicator={false}
          >

            <Input
              ref={titleInputRef}
              label="Task Name"
              mentions
              value={name}
              onChangeText={setName}
              placeholder="What needs to be done?"
              autoFocus
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={handleCreate}
            />

            {/* Where the task lives. Hidden when opened from a list page. */}
            {!hideListPicker && (
              <ListPicker
                value={listId}
                onChange={handleListChange}
                mode="add"
              />
            )}

            {/* What the task counts toward — follows the list by default. */}
            <TrackablePicker
              value={trackableId}
              inheritedTrackableId={inheritedTrackableId}
              onChange={handleTrackableChange}
            />
          </KeyboardAwareScrollView>

          {/* Fixed footer (outside the scroll) so Cancel/Create stay
           * visible while the keyboard is up and the card is
           * height-capped. */}
          <DialogFooter>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={onClose}
              size="small"
            />
            <Button title="Create" onPress={handleCreate} size="small" />
          </DialogFooter>
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
    ...dialogSurfaceStyle,
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
    fontSize: FontSize.title,
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
