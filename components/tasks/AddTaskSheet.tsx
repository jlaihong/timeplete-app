import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, TextInput } from "react-native";
import { useMutation, useQuery } from "convex/react";
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
import { applyTaskUpsertOptimisticUpdate } from "../../lib/taskUpsertOptimisticUpdate";
import { AutoDismissToast } from "../ui/AutoDismissToast";
import { useRegisterEscapeClose } from "../../hooks/useRegisterEscapeClose";
import {
  initialAssignmentStateFromAddTaskContext,
  resolveEffectiveListIdForTaskCreate,
} from "../../lib/addTaskDefaults";

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
  useRegisterEscapeClose(onClose);
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
  const upsertTask = useMutation(api.tasks.upsert).withOptimisticUpdate(
    (localStore, args) => {
      applyTaskUpsertOptimisticUpdate(localStore, args);
    },
  );

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

    setName("");
    showToast("Task added");
    // Keep the title field focused after Enter so rapid multi-add UX works;
    // submit still blurs on some platforms without an explicit refocus.
    queueMicrotask(() => titleInputRef.current?.focus());

    void upsertTask({
      name: title,
      taskDay: day ?? todayYYYYMMDD(),
      listId: effectiveListId,
      sectionId,
      parentId,
      trackableId: trackableId ?? undefined,
      clientViewerUserId:
        profileReady && profile ? profile._id : undefined,
    }).catch((err) => {
      console.error("[AddTaskSheet] Failed to create task:", err);
      showToast("Could not create task");
    });
  };

  return (
    <View style={styles.overlay}>
      <Card style={styles.dialog}>
        <ScrollView>
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

          <View style={styles.actions}>
            <Button title="Cancel" variant="outline" onPress={onClose} />
            <Button title="Create Task" onPress={handleCreate} />
          </View>
        </ScrollView>
      </Card>
      <AutoDismissToast
        key={toastKey}
        message={toastMessage}
        onDismiss={clearToast}
        durationMs={1100}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  dialog: { width: "100%", maxWidth: 420, maxHeight: "85%" },
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
  },
});
