import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
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

interface AddTaskSheetProps {
  day?: string;
  listId?: Id<"lists">;
  sectionId?: Id<"listSections">;
  parentId?: Id<"tasks">;
  trackableId?: Id<"trackables">;
  onClose: () => void;
}

export function AddTaskSheet({
  day,
  listId: initialListId,
  sectionId,
  parentId,
  trackableId: initialTrackableId,
  onClose,
}: AddTaskSheetProps) {
  const [name, setName] = useState("");
  const [trackableId, setTrackableId] = useState<Id<"trackables"> | null>(
    initialTrackableId ?? null
  );
  // Local manual list selection. `null` here means "no manual list" — on
  // save we fall back to the inbox list (mirrors P1's `AddTask.onSave`).
  const [listId, setListId] = useState<Id<"lists"> | null>(
    initialListId ?? null
  );
  const [loading, setLoading] = useState(false);

  const lists = useQuery(api.lists.search, {});
  const upsertTask = useMutation(api.tasks.upsert);

  const inboxListId =
    lists?.find((l) => l.isInbox)?._id ?? null;

  // P1: when a trackable is locked at open time (e.g. opened from a
  // trackable widget) the list field is hidden. Same when the user
  // manually picks a trackable in this dialog.
  const isTrackableLocked = !!initialTrackableId;
  const hasGoalSelected = !!trackableId;

  // Mutual exclusion handlers — verbatim from P1's
  // `onGoalSelectionChange` / `onListSelectionChange`.
  const handleTrackableChange = (id: Id<"trackables"> | null) => {
    setTrackableId(id);
    if (id) setListId(null);
  };
  const handleListChange = (id: Id<"lists"> | null) => {
    setListId(id);
    if (id) setTrackableId(null);
  };

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      // P1's `AddTask.onSave` resolution order:
      //   1. trackable selected → use the goal's list (we don't pre-fetch
      //      that here; the server is the source of truth for goal-list
      //      attribution, so we just send `trackableId`).
      //   2. else, manual `listId`.
      //   3. else, fall back to inbox.
      const effectiveListId: Id<"lists"> | undefined = trackableId
        ? undefined
        : (listId ?? inboxListId ?? undefined);

      await upsertTask({
        name: name.trim(),
        taskDay: day ?? todayYYYYMMDD(),
        listId: effectiveListId,
        sectionId,
        parentId,
        trackableId: trackableId ?? undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.overlay}>
      <Card style={styles.dialog}>
        <ScrollView>
          <Text style={styles.title}>
            {parentId ? "Add Subtask" : "Add Task"}
          </Text>

          <Input
            label="Task Name"
            value={name}
            onChangeText={setName}
            placeholder="What needs to be done?"
            autoFocus
          />

          <TrackablePicker
            value={trackableId}
            onChange={handleTrackableChange}
          />

          {/* List picker is hidden when a trackable is selected (the
              trackable's backing list is used) or when this dialog was
              opened with a locked trackable. Mirrors P1's
              `@if (!hasGoalSelected() && !isTrackableLocked)`. */}
          {!hasGoalSelected && !isTrackableLocked && (
            <ListPicker
              value={listId}
              onChange={handleListChange}
              mode="add"
            />
          )}

          <View style={styles.actions}>
            <Button title="Cancel" variant="outline" onPress={onClose} />
            <Button
              title="Create Task"
              onPress={handleCreate}
              loading={loading}
            />
          </View>
        </ScrollView>
      </Card>
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
