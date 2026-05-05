import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import type { Id } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { ANALYTICS_TABS } from "../analytics/AnalyticsState";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

function frequencyLabel(f: Frequency): string {
  return ANALYTICS_TABS.find((t) => t.id === f)?.label ?? f;
}

interface QuestionSettingsProps {
  frequency: Frequency;
}

export function QuestionSettings({ frequency }: QuestionSettingsProps) {
  const questions = useQuery(api.reviews.searchQuestions, { frequency });
  const upsertQuestion = useMutation(api.reviews.upsertQuestion);
  const archiveQuestion = useMutation(api.reviews.archiveQuestion);
  const removeQuestion = useMutation(api.reviews.removeQuestion);
  const [newText, setNewText] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<Id<"reviewQuestions"> | null>(
    null
  );
  const [editText, setEditText] = useState("");

  const sorted = questions
    ?.filter((q) => !q.archived)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const handleAdd = async () => {
    if (!newText.trim()) return;
    await upsertQuestion({
      questionText: newText.trim(),
      frequency,
    });
    setNewText("");
    setAdding(false);
  };

  const handleDelete = (id: Id<"reviewQuestions">) => {
    const run = () => removeQuestion({ id });
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (
        window.confirm(
          "Delete this question? All answers stored for it will be removed."
        )
      ) {
        run();
      }
    } else {
      Alert.alert("Delete question", "This will also delete all answers.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: run },
      ]);
    }
  };

  const startEdit = (id: Id<"reviewQuestions">, text: string) => {
    setEditingId(id);
    setEditText(text);
  };

  const saveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    await upsertQuestion({
      id: editingId,
      questionText: editText.trim(),
      frequency,
    });
    setEditingId(null);
    setEditText("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditText("");
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{frequencyLabel(frequency)} questions</Text>
        <TouchableOpacity onPress={() => setAdding(!adding)}>
          <Ionicons
            name={adding ? "close" : "add-circle"}
            size={24}
            color={Colors.primary}
          />
        </TouchableOpacity>
      </View>

      {adding && (
        <Card style={styles.addCard}>
          <Input
            value={newText}
            onChangeText={setNewText}
            placeholder="Your review question..."
            multiline
          />
          <Button title="Add Question" onPress={handleAdd} />
        </Card>
      )}

      {sorted?.map((q) => (
        <Card key={q._id} style={styles.questionCard} padded={false}>
          {editingId === q._id ? (
            <View style={styles.editBlock}>
              <Input
                value={editText}
                onChangeText={setEditText}
                placeholder="Question text..."
                multiline
              />
              <View style={styles.editActions}>
                <Button title="Cancel" variant="ghost" onPress={cancelEdit} />
                <Button title="Save" onPress={saveEdit} />
              </View>
            </View>
          ) : (
            <View style={styles.questionRow}>
              <Text style={styles.questionText}>{q.questionText}</Text>
              <View style={styles.questionActions}>
                <TouchableOpacity
                  onPress={() => startEdit(q._id, q.questionText)}
                >
                  <Ionicons
                    name="pencil-outline"
                    size={18}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => archiveQuestion({ id: q._id })}
                >
                  <Ionicons
                    name="archive-outline"
                    size={18}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDelete(q._id)}>
                  <Ionicons
                    name="trash-outline"
                    size={18}
                    color={Colors.textTertiary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {},
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  addCard: { marginBottom: 12 },
  questionCard: { marginBottom: 6 },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  questionText: { flex: 1, fontSize: 14, color: Colors.text },
  questionActions: { flexDirection: "row", gap: 12 },
  editBlock: { padding: 14, gap: 10 },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
});
