import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
  Pressable,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { TrackablePicker } from "./TrackablePicker";
import { ListPicker } from "./ListPicker";
import { useTimer } from "../../hooks/useTimer";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import {
  formatSecondsAsHM,
  formatDisplayDate,
  todayYYYYMMDD,
} from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";

type Tab = "details" | "time" | "comments";

interface TaskDetailSheetProps {
  taskId: Id<"tasks">;
  onClose: () => void;
}

export function TaskDetailSheet({ taskId, onClose }: TaskDetailSheetProps) {
  const isDesktop = useIsDesktop();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const tasks = useQuery(api.tasks.search, { includeCompleted: true });
  const task = tasks?.find((t) => t._id === taskId);
  const timeTracked = useQuery(api.tasks.getTimeTracked, { taskId });
  const comments = useQuery(api.taskComments.search, { taskId, limit: 50 });
  const tags = useQuery(api.tags.search, {});
  const lists = useQuery(api.lists.search, {});

  const upsertTask = useMutation(api.tasks.upsert);
  const upsertComment = useMutation(api.taskComments.upsert);
  const removeComment = useMutation(api.taskComments.remove);
  const removeTask = useMutation(api.tasks.remove);
  const timer = useTimer();

  const [activeTab, setActiveTab] = useState<Tab>("details");
  const [newComment, setNewComment] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");

  // Timer state is still needed for the "Time Tracked" tab (Active now
  // row), but the details tab no longer exposes start/pause — matching
  // productivity-one's `task-details` which has no in-dialog timer.
  const isTimerActive = timer.isRunning && timer.taskId === taskId;
  const storedTime = task?.timeSpentInSecondsUnallocated ?? 0;

  useEffect(() => {
    if (task) setName(task.name);
  }, [task?.name]);

  if (!task) return null;

  const taskTags = (task.tagIds ?? [])
    .map((id: string) => tags?.find((t) => t._id === id))
    .filter(Boolean);

  const handleToggleComplete = async () => {
    await upsertTask({
      id: taskId,
      name: task.name,
      dateCompleted: task.dateCompleted ? undefined : todayYYYYMMDD(),
    });
  };

  const handleSaveName = async () => {
    if (name.trim() && name.trim() !== task.name) {
      await upsertTask({ id: taskId, name: name.trim() });
    }
    setEditingName(false);
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    await upsertComment({ taskId, commentText: newComment.trim() });
    setNewComment("");
  };

  const formatLive = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
      return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const dialogWidth = isDesktop
    ? Math.min(640, windowWidth * 0.5)
    : windowWidth;
  const dialogMaxHeight = isDesktop
    ? windowHeight * 0.85
    : windowHeight * 0.9;

  const renderDetailsTab = () => (
    <>
      {/* Metadata — productivity-one's `task-details` shows time spent
          on the dedicated time tab; no Start/Pause toggle in the dialog
          itself. The row-level play button on the task panel is the
          only timer affordance, matching P1 exactly. */}
      <View style={styles.metaRow}>
        {storedTime > 0 && (
          <View style={styles.metaChip}>
            <Ionicons
              name="time-outline"
              size={14}
              color={Colors.textSecondary}
            />
            <Text style={styles.metaChipText}>
              {formatSecondsAsHM(storedTime)} tracked
            </Text>
          </View>
        )}
        {(task.timeEstimatedInSecondsUnallocated ?? 0) > 0 && (
          <View style={styles.metaChip}>
            <Ionicons name="hourglass-outline" size={14} color={Colors.textSecondary} />
            <Text style={styles.metaChipText}>
              Est: {formatSecondsAsHM(task.timeEstimatedInSecondsUnallocated)}
            </Text>
          </View>
        )}
        {task.dueDateYYYYMMDD && (
          <View style={styles.metaChip}>
            <Ionicons name="flag-outline" size={14} color={Colors.warning} />
            <Text style={styles.metaChipText}>
              Due: {formatDisplayDate(task.dueDateYYYYMMDD)}
            </Text>
          </View>
        )}
        {task.taskDay && (
          <View style={styles.metaChip}>
            <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
            <Text style={styles.metaChipText}>
              {formatDisplayDate(task.taskDay)}
            </Text>
          </View>
        )}
      </View>

      {/* Trackable assignment — productivity-one's `<mat-select>` parity.
          Selecting a trackable clears any manual list (P1 hides the
          List field while a goal is selected and falls back to the
          goal's backing list on save). */}
      <TrackablePicker
        value={task.trackableId ?? null}
        onChange={async (id) => {
          await upsertTask({
            id: taskId,
            name: task.name,
            trackableId: id,
            // Picking a trackable clears the manual list selection
            // (matches P1 `goalFormControl.valueChanges` → setListValue(null)).
            listId: id ? undefined : task.listId,
          });
        }}
      />

      {/* List assignment — only shown when no trackable is selected,
          mirroring P1 `task-details.html`:
            @if (!hasGoalSelected()) { <mat-form-field>List</mat-form-field> } */}
      {!task.trackableId && (
        <ListPicker
          mode="edit"
          value={task.listId ?? null}
          onChange={async (id) => {
            // `id` may be:
            //   - a real list id → assign to that list
            //   - the inbox list's id → assign to inbox
            //   - null → no list (rare; ListPicker normally returns the
            //     inbox id in edit mode when "Inbox" is picked).
            const inboxListId =
              lists?.find((l) => l.isInbox)?._id ?? undefined;
            await upsertTask({
              id: taskId,
              name: task.name,
              listId: id ?? inboxListId,
            });
          }}
        />
      )}

      {/* Tags */}
      {taskTags.length > 0 && (
        <View style={styles.tagsRow}>
          {taskTags.map((tag: any) => (
            <View
              key={tag._id}
              style={[styles.tagChip, { borderColor: tag.colour ?? Colors.outline }]}
            >
              <View
                style={[styles.tagDot, { backgroundColor: tag.colour ?? Colors.outline }]}
              />
              <Text style={styles.tagText}>{tag.name}</Text>
            </View>
          ))}
        </View>
      )}

      <Button
        title="Delete Task"
        variant="danger"
        onPress={() => {
          removeTask({ id: taskId });
          onClose();
        }}
        style={styles.deleteBtn}
      />
    </>
  );

  const renderTimeTab = () => (
    <>
      <View style={styles.timeSummary}>
        <Text style={styles.timeSummaryLabel}>Total tracked</Text>
        <Text style={styles.timeSummaryValue}>
          {formatSecondsAsHM(timeTracked?.totalSeconds ?? storedTime)}
        </Text>
      </View>

      {isTimerActive && (
        <View style={[styles.sessionRow, styles.sessionRowActive]}>
          <View style={styles.sessionDot} />
          <Text style={[styles.sessionTime, styles.sessionTimeActive]}>
            Active now
          </Text>
          <Text style={[styles.sessionDuration, styles.sessionTimeActive]}>
            {formatLive(timer.elapsed)}
          </Text>
        </View>
      )}

      {timeTracked?.sessions.map((session) => (
        <View key={session.day} style={styles.sessionGroup}>
          <Text style={styles.sessionDayHeader}>
            {formatDisplayDate(session.day)}
            <Text style={styles.sessionDayTotal}>
              {" "}
              — {formatSecondsAsHM(session.totalSeconds)}
            </Text>
          </Text>
          {session.windows.map((w) => (
            <View key={w.id} style={styles.sessionRow}>
              <Text style={styles.sessionTime}>{w.startTime}</Text>
              <Text style={styles.sessionDuration}>
                {formatSecondsAsHM(w.durationSeconds)}
              </Text>
            </View>
          ))}
        </View>
      ))}

      {(!timeTracked || timeTracked.sessions.length === 0) &&
        !isTimerActive && (
          <Text style={styles.emptyText}>No time tracked yet</Text>
        )}
    </>
  );

  const renderCommentsTab = () => (
    <>
      <View style={styles.commentInput}>
        <TextInput
          style={styles.commentField}
          value={newComment}
          onChangeText={setNewComment}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.textTertiary}
          onSubmitEditing={handleAddComment}
        />
        <TouchableOpacity onPress={handleAddComment}>
          <Ionicons name="send" size={20} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {comments?.map((c) => (
        <View key={c._id} style={styles.comment}>
          <View style={styles.commentRow}>
            <Text style={styles.commentText}>{c.commentText}</Text>
            <TouchableOpacity
              onPress={() => removeComment({ id: c._id })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {(!comments || comments.length === 0) && (
        <Text style={styles.emptyText}>No comments yet</Text>
      )}
    </>
  );

  const content = (
    <View
      style={[
        isDesktop ? styles.dialogPanel : styles.sheet,
        isDesktop && { width: dialogWidth, maxHeight: dialogMaxHeight },
      ]}
    >
      {/* Header */}
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
            onSubmitEditing={handleSaveName}
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
            <Text
              style={[
                styles.taskName,
                task.dateCompleted && styles.taskNameCompleted,
              ]}
            >
              {task.name}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={24} color={Colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        {(["details", "time", "comments"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab === "details"
                ? "Details"
                : tab === "time"
                  ? `Time Tracked`
                  : `Comments${comments?.length ? ` (${comments.length})` : ""}`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <ScrollView contentContainerStyle={styles.content}>
        {activeTab === "details" && renderDetailsTab()}
        {activeTab === "time" && renderTimeTab()}
        {activeTab === "comments" && renderCommentsTab()}
      </ScrollView>
    </View>
  );

  return (
    <Pressable
      style={[
        styles.overlay,
        isDesktop ? styles.overlayDesktop : styles.overlayMobile,
      ]}
      onPress={onClose}
    >
      <Pressable onPress={(e) => e.stopPropagation?.()}>
        {content}
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  overlayMobile: { justifyContent: "flex-end" },
  overlayDesktop: { justifyContent: "center", alignItems: "center" },
  sheet: {
    maxHeight: "90%",
    backgroundColor: Colors.surfaceContainerHigh,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  dialogPanel: {
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: 12,
    overflow: "hidden",
    ...Platform.select({
      web: { boxShadow: "0 8px 32px rgba(0,0,0,0.5)" } as any,
      default: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.5,
        shadowRadius: 32,
        elevation: 12,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  nameContainer: { flex: 1 },
  taskName: { fontSize: 18, fontWeight: "600", color: Colors.text },
  taskNameCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  nameInput: {
    flex: 1,
    fontSize: 18,
    fontWeight: "600",
    color: Colors.text,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primary,
    paddingBottom: 4,
  },

  tabBar: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: 13, fontWeight: "500", color: Colors.textSecondary },
  tabTextActive: { color: Colors.primary, fontWeight: "600" },

  content: { padding: 16, paddingBottom: 40 },

  metaRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 6,
  },
  metaChipText: { fontSize: 12, color: Colors.textSecondary },

  tagsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginBottom: 16,
  },
  tagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  tagDot: { width: 8, height: 8, borderRadius: 4 },
  tagText: { fontSize: 12, color: Colors.text },

  deleteBtn: { marginTop: 16 },

  timeSummary: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  timeSummaryLabel: { fontSize: 14, color: Colors.textSecondary },
  timeSummaryValue: { fontSize: 18, fontWeight: "700", color: Colors.text },

  sessionGroup: { marginBottom: 16 },
  sessionDayHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
  },
  sessionDayTotal: { fontWeight: "400" },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginBottom: 2,
  },
  sessionRowActive: { backgroundColor: Colors.success + "15" },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
  },
  sessionTime: { fontSize: 13, color: Colors.textSecondary },
  sessionTimeActive: { color: Colors.success, fontWeight: "600" },
  sessionDuration: {
    fontSize: 13,
    color: Colors.text,
    fontVariant: ["tabular-nums"] as any,
  },

  commentInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
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
  comment: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  commentText: { fontSize: 14, color: Colors.text, flex: 1 },

  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: "center",
    paddingVertical: 24,
  },
});
