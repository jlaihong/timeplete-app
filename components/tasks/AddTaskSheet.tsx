import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { todayYYYYMMDD } from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";

interface AddTaskSheetProps {
  day?: string;
  listId?: Id<"lists">;
  sectionId?: Id<"listSections">;
  parentId?: Id<"tasks">;
  onClose: () => void;
}

export function AddTaskSheet({
  day,
  listId,
  sectionId,
  parentId,
  onClose,
}: AddTaskSheetProps) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [estimateMinutes, setEstimateMinutes] = useState("");
  const [selectedTags, setSelectedTags] = useState<Id<"tags">[]>([]);
  const [loading, setLoading] = useState(false);

  const tags = useQuery(api.tags.search);
  const upsertTask = useMutation(api.tasks.upsert);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await upsertTask({
        name: name.trim(),
        taskDay: day ?? todayYYYYMMDD(),
        listId,
        sectionId,
        parentId,
        dueDateYYYYMMDD: dueDate || undefined,
        timeEstimatedInSecondsUnallocated: estimateMinutes
          ? parseInt(estimateMinutes) * 60
          : undefined,
        tagIds: selectedTags.length > 0 ? selectedTags : undefined,
      });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toggleTag = (tagId: Id<"tags">) => {
    setSelectedTags((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
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

          <Input
            label="Due Date (YYYYMMDD)"
            value={dueDate}
            onChangeText={setDueDate}
            placeholder="Optional"
            keyboardType="numeric"
          />

          <Input
            label="Time Estimate (minutes)"
            value={estimateMinutes}
            onChangeText={setEstimateMinutes}
            placeholder="Optional"
            keyboardType="numeric"
          />

          {tags && tags.filter((t) => !t.archived).length > 0 && (
            <>
              <Text style={styles.fieldLabel}>Tags</Text>
              <View style={styles.tagList}>
                {tags
                  .filter((t) => !t.archived)
                  .map((tag) => (
                    <TouchableOpacity
                      key={tag._id}
                      style={[
                        styles.tagChip,
                        {
                          borderColor: tag.colour,
                          backgroundColor: selectedTags.includes(tag._id)
                            ? tag.colour + "20"
                            : "transparent",
                        },
                      ]}
                      onPress={() => toggleTag(tag._id)}
                    >
                      <View
                        style={[styles.tagDot, { backgroundColor: tag.colour }]}
                      />
                      <Text style={styles.tagName}>{tag.name}</Text>
                    </TouchableOpacity>
                  ))}
              </View>
            </>
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
  fieldLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  tagList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 6,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagName: { fontSize: 13, color: Colors.text },
  actions: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "flex-end",
    marginTop: 8,
  },
});
