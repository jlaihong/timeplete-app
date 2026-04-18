import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

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

  const handleDelete = (id: string) => {
    Alert.alert("Delete Question", "This will also delete all answers.", [
      { text: "Cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeQuestion({ id: id as any }),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{frequency} Questions</Text>
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
          <View style={styles.questionRow}>
            <Text style={styles.questionText}>{q.questionText}</Text>
            <View style={styles.questionActions}>
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
});
