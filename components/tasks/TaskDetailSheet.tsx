import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Card } from "../ui/Card";
import { useTimer } from "../../hooks/useTimer";
import { formatSecondsAsHM, todayYYYYMMDD } from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";

interface TaskDetailSheetProps {
  taskId: Id<"tasks">;
  onClose: () => void;
}

export function TaskDetailSheet({ taskId, onClose }: TaskDetailSheetProps) {
  const tasks = useQuery(api.tasks.search, { includeCompleted: true });
  const task = tasks?.find((t) => t._id === taskId);
  const comments = useQuery(api.taskComments.search, {
    taskId,
    limit: 20,
  });
  const upsertTask = useMutation(api.tasks.upsert);
  const upsertComment = useMutation(api.taskComments.upsert);
  const removeTask = useMutation(api.tasks.remove);
  const timer = useTimer();
  const [newComment, setNewComment] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");

  if (!task) return null;

  const handleToggleComplete = async () => {
    await upsertTask({
      id: taskId,
      name: task.name,
      dateCompleted: task.dateCompleted ? undefined : todayYYYYMMDD(),
    });
  };

  const handleSaveName = async () => {
    if (name.trim()) {
      await upsertTask({ id: taskId, name: name.trim() });
    }
    setEditingName(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await upsertComment({ taskId, commentText: newComment.trim() });
    setNewComment("");
  };

  const handleStartTimer = () => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    timer.startForTask(taskId, tz);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleToggleComplete}>
          <Ionicons
            name={task.dateCompleted ? "checkbox" : "square-outline"}
            size={24}
            color={task.dateCompleted ? Colors.success : Colors.textTertiary}
          />
        </TouchableOpacity>
        {editingName ? (
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            onBlur={handleSaveName}
            autoFocus
          />
        ) : (
          <TouchableOpacity
            style={styles.nameContainer}
            onPress={() => {
              setName(task.name);
              setEditingName(true);
            }}
          >
            <Text style={styles.taskName}>{task.name}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.metaText}>
              {formatSecondsAsHM(task.timeSpentInSecondsUnallocated)} spent
            </Text>
          </View>
          {task.dueDateYYYYMMDD && (
            <View style={styles.metaItem}>
              <Ionicons name="flag-outline" size={16} color={Colors.warning} />
              <Text style={styles.metaText}>Due: {task.dueDateYYYYMMDD}</Text>
            </View>
          )}
        </View>

        <View style={styles.timerRow}>
          {timer.isRunning && timer.taskId === taskId ? (
            <Button title="Stop Timer" variant="danger" onPress={timer.stop} />
          ) : (
            <Button
              title="Start Timer"
              variant="outline"
              onPress={handleStartTimer}
              icon={<Ionicons name="timer-outline" size={18} color={Colors.text} />}
            />
          )}
        </View>

        <Card style={styles.commentsSection}>
          <Text style={styles.sectionTitle}>Comments</Text>
          {comments?.map((c) => (
            <View key={c._id} style={styles.comment}>
              <Text style={styles.commentText}>{c.commentText}</Text>
            </View>
          ))}
          <View style={styles.commentInput}>
            <TextInput
              style={styles.commentField}
              value={newComment}
              onChangeText={setNewComment}
              placeholder="Add a comment..."
              placeholderTextColor={Colors.textTertiary}
            />
            <TouchableOpacity onPress={handleAddComment}>
              <Ionicons name="send" size={20} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </Card>

        <Button
          title="Delete Task"
          variant="danger"
          onPress={() => {
            removeTask({ id: taskId });
            onClose();
          }}
          style={styles.deleteBtn}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  nameContainer: { flex: 1 },
  taskName: { fontSize: 18, fontWeight: "600", color: Colors.text },
  nameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingBottom: 4,
  },
  content: { padding: 16, paddingBottom: 40 },
  metaRow: { flexDirection: "row", gap: 16, marginBottom: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  metaText: { fontSize: 13, color: Colors.textSecondary },
  timerRow: { marginBottom: 16 },
  commentsSection: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 12,
  },
  comment: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  commentText: { fontSize: 14, color: Colors.text },
  commentInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  commentField: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: Colors.text,
  },
  deleteBtn: { marginTop: 8 },
});
