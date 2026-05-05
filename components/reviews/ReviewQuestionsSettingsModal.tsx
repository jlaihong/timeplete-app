/**
 * productivity-one `ReviewQuestionsSettingsComponent` — dialog title
 * "Review questions", Active / Archived tabs, table with drag reorder,
 * edit / archive / delete, add-question flow. Width 560px.
 */

import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
  ScrollView,
} from "react-native";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation, useQuery } from "convex/react";
import { MaterialIcons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import type { ReviewFrequency } from "../../lib/reviewParity";

type TabKey = "active" | "archived";

export function ReviewQuestionsSettingsModal({
  visible,
  onClose,
  frequency,
}: {
  visible: boolean;
  onClose: () => void;
  frequency: ReviewFrequency;
}) {
  const questions = useQuery(api.reviews.searchQuestions, { frequency });
  const upsertQuestion = useMutation(api.reviews.upsertQuestion);
  const moveQuestion = useMutation(api.reviews.moveQuestion);
  const archiveQuestion = useMutation(api.reviews.archiveQuestion);
  const removeQuestion = useMutation(api.reviews.removeQuestion);

  const [tab, setTab] = useState<TabKey>("active");
  const [showAddInput, setShowAddInput] = useState(false);
  const [newQuestionText, setNewQuestionText] = useState("");

  const [editTarget, setEditTarget] = useState<Doc<"reviewQuestions"> | null>(
    null
  );
  const [editText, setEditText] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Doc<"reviewQuestions"> | null>(
    null
  );
  const [deleteConfirm, setDeleteConfirm] = useState("");

  const activeQuestions = useMemo(() => {
    const list = questions?.filter((q) => !q.archived) ?? [];
    return [...list].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [questions]);

  const archivedQuestions = useMemo(() => {
    const list = questions?.filter((q) => q.archived) ?? [];
    return [...list].sort((a, b) => a.orderIndex - b.orderIndex);
  }, [questions]);

  const activeCols = activeQuestions;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const onDragEndActive = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids = activeQuestions.map((q) => q._id);
      const oldIndex = ids.indexOf(active.id as Id<"reviewQuestions">);
      const newIndex = ids.indexOf(over.id as Id<"reviewQuestions">);
      if (oldIndex < 0 || newIndex < 0) return;
      const moved = activeQuestions[oldIndex];
      if (!moved) return;
      await moveQuestion({ id: moved._id, newOrderIndex: newIndex });
    },
    [activeQuestions, moveQuestion]
  );

  const moveRow = useCallback(
    async (from: number, to: number) => {
      if (to < 0 || to >= activeCols.length) return;
      const moved = activeCols[from];
      if (!moved) return;
      await moveQuestion({ id: moved._id, newOrderIndex: to });
    },
    [activeCols, moveQuestion]
  );

  const openEdit = (q: Doc<"reviewQuestions">) => {
    setEditTarget(q);
    setEditText(q.questionText);
  };

  const saveEdit = async () => {
    const t = editText.trim();
    if (!editTarget || !t) return;
    await upsertQuestion({
      id: editTarget._id,
      questionText: t,
      frequency: editTarget.frequency,
    });
    setEditTarget(null);
    setEditText("");
  };

  const addQuestion = async () => {
    const t = newQuestionText.trim();
    if (!t) return;
    await upsertQuestion({ questionText: t, frequency });
    setNewQuestionText("");
    setShowAddInput(false);
  };

  if (!visible) return null;

  return (
      <>
        <DialogOverlay onBackdropPress={onClose} zIndex={2400}>
          <DialogCard desktopWidth={560} style={styles.settingsCard}>
            <DialogHeader title="Review questions" onClose={onClose} />
            {!questions ? (
              <Text style={styles.muted}>Loading...</Text>
            ) : (
              <>
                <View style={styles.tabRow}>
                  <Pressable
                    onPress={() => setTab("active")}
                    style={[styles.tab, tab === "active" && styles.tabOn]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === "active" && styles.tabTextOn,
                      ]}
                    >
                      Active ({activeQuestions.length})
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      archivedQuestions.length > 0 && setTab("archived")
                    }
                    disabled={archivedQuestions.length === 0}
                    style={[
                      styles.tab,
                      tab === "archived" && styles.tabOn,
                      archivedQuestions.length === 0 && styles.tabDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabText,
                        tab === "archived" && styles.tabTextOn,
                        archivedQuestions.length === 0 && styles.tabTextDis,
                      ]}
                    >
                      Archived ({archivedQuestions.length})
                    </Text>
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.settingsScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {tab === "active" ? (
                    <>
                      {activeQuestions.length === 0 && !showAddInput ? (
                        <Text style={styles.muted}>
                          No questions yet. Add one below.
                        </Text>
                      ) : null}

                      {isWeb ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={onDragEndActive}
                        >
                          <SortableContext
                            items={activeQuestions.map((q) => q._id)}
                            strategy={verticalListSortingStrategy}
                          >
                            {activeQuestions.map((q, i) => (
                              <WebQuestionSortRow
                                key={q._id}
                                question={q}
                                onEdit={() => openEdit(q)}
                                onArchive={() =>
                                  archiveQuestion({ id: q._id })
                                }
                                onDelete={() => setDeleteTarget(q)}
                              />
                            ))}
                          </SortableContext>
                        </DndContext>
                      ) : (
                        activeQuestions.map((q, i) => (
                          <NativeQuestionRow
                            key={q._id}
                            question={q}
                            index={i}
                            total={activeQuestions.length}
                            onMoveUp={() => moveRow(i, i - 1)}
                            onMoveDown={() => moveRow(i, i + 1)}
                            onEdit={() => openEdit(q)}
                            onArchive={() => archiveQuestion({ id: q._id })}
                            onDelete={() => setDeleteTarget(q)}
                          />
                        ))
                      )}

                      {showAddInput ? (
                        <View style={styles.addForm}>
                          <Text style={styles.inputLabel}>New question</Text>
                          <TextInput
                            style={styles.outlineInput}
                            value={newQuestionText}
                            onChangeText={setNewQuestionText}
                            placeholder="e.g. What went well?"
                            placeholderTextColor={Colors.textTertiary}
                          />
                          <View style={styles.addActions}>
                            <Button
                              title="Cancel"
                              variant="ghost"
                              onPress={() => {
                                setShowAddInput(false);
                                setNewQuestionText("");
                              }}
                            />
                            <Button title="Add" onPress={addQuestion} />
                          </View>
                        </View>
                      ) : (
                        <Pressable
                          style={styles.addQuestionBtn}
                          onPress={() => setShowAddInput(true)}
                        >
                          <MaterialIcons
                            name="add"
                            size={18}
                            color={Colors.primary}
                          />
                          <Text style={styles.addQuestionBtnText}>
                            Add question
                          </Text>
                        </Pressable>
                      )}
                    </>
                  ) : archivedQuestions.length === 0 ? (
                    <Text style={styles.muted}>No archived questions.</Text>
                  ) : (
                    archivedQuestions.map((q) => (
                      <ArchivedRow
                        key={q._id}
                        question={q}
                        onEdit={() => openEdit(q)}
                        onUnarchive={() => archiveQuestion({ id: q._id })}
                        onDelete={() => setDeleteTarget(q)}
                      />
                    ))
                  )}
                </ScrollView>

                <DialogFooter>
                  <Button title="Close" variant="ghost" onPress={onClose} />
                </DialogFooter>
              </>
            )}
          </DialogCard>
        </DialogOverlay>

        {editTarget ? (
          <DialogOverlay
            onBackdropPress={() => setEditTarget(null)}
            zIndex={2600}
          >
            <DialogCard desktopWidth={400}>
              <DialogHeader
                title="Edit question"
                onClose={() => setEditTarget(null)}
              />
              <Text style={styles.inputLabel}>Question</Text>
              <TextInput
                style={styles.outlineInput}
                value={editText}
                onChangeText={setEditText}
                placeholder="e.g. What went well?"
                placeholderTextColor={Colors.textTertiary}
              />
              <DialogFooter>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setEditTarget(null)}
                />
                <Button title="Save" onPress={saveEdit} />
              </DialogFooter>
            </DialogCard>
          </DialogOverlay>
        ) : null}

        {deleteTarget ? (
          <DialogOverlay
            onBackdropPress={() => {
              setDeleteTarget(null);
              setDeleteConfirm("");
            }}
            zIndex={2600}
          >
            <DialogCard desktopWidth={400}>
              <DialogHeader
                title="Delete question?"
                onClose={() => {
                  setDeleteTarget(null);
                  setDeleteConfirm("");
                }}
              />
              <Text style={styles.deleteBody}>{deleteTarget.questionText}</Text>
              <Text style={styles.deleteWarn}>
                This will also delete all answers to this question.
              </Text>
              <Text style={styles.inputLabel}>
                Type &quot;Delete&quot; to confirm
              </Text>
              <TextInput
                style={styles.outlineInput}
                value={deleteConfirm}
                onChangeText={setDeleteConfirm}
                placeholder="Delete"
                placeholderTextColor={Colors.textTertiary}
                autoCapitalize="none"
              />
              <DialogFooter>
                <Button
                  title="Cancel"
                  variant="danger"
                  onPress={() => {
                    setDeleteTarget(null);
                    setDeleteConfirm("");
                  }}
                />
                <Button
                  title="Delete"
                  onPress={async () => {
                    await removeQuestion({ id: deleteTarget._id });
                    setDeleteTarget(null);
                    setDeleteConfirm("");
                  }}
                  disabled={deleteConfirm !== "Delete"}
                />
              </DialogFooter>
            </DialogCard>
          </DialogOverlay>
        ) : null}
      </>
    );
}

function WebQuestionSortRow({
  question,
  onEdit,
  onArchive,
  onDelete,
}: {
  question: Doc<"reviewQuestions">;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: question._id });

  const rowStyle = {
    display: "flex" as const,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    width: "100%" as const,
    boxSizing: "border-box" as const,
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.65 : 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    paddingVertical: 6,
    gap: 8,
  };

  return (
    <div ref={setNodeRef as React.Ref<HTMLDivElement>} style={rowStyle}>
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reorder question"
        style={{
          width: 40,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: isDragging ? "grabbing" : "grab",
          border: "none",
          background: "transparent",
          padding: 6,
        }}
      >
        <MaterialIcons
          name="drag-indicator"
          size={20}
          color={Colors.textTertiary}
        />
      </button>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 14,
          color: Colors.text,
        }}
      >
        {question.questionText}
      </div>
      <div style={{ flexShrink: 0, display: "flex", flexDirection: "row", gap: 4 }}>
        <IconBtn icon="edit" label="Edit question" onPress={onEdit} />
        <IconBtn icon="archive" label="Archive question" onPress={onArchive} />
        <IconBtn icon="delete" label="Delete question" onPress={onDelete} />
      </div>
    </div>
  );
}

function IconBtn({
  icon,
  label,
  onPress,
}: {
  icon: "edit" | "archive" | "delete" | "unarchive";
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      style={styles.iconHit}
    >
      <MaterialIcons name={icon} size={20} color={Colors.textSecondary} />
    </Pressable>
  );
}

function NativeQuestionRow({
  question,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onEdit,
  onArchive,
  onDelete,
}: {
  question: Doc<"reviewQuestions">;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.nativeRow}>
      <View style={styles.nativeReorder}>
        <Pressable
          onPress={onMoveUp}
          disabled={index === 0}
          style={[styles.nudge, index === 0 && styles.nudgeOff]}
        >
          <MaterialIcons
            name="keyboard-arrow-up"
            size={22}
            color={index === 0 ? Colors.textTertiary : Colors.textSecondary}
          />
        </Pressable>
        <MaterialIcons
          name="drag-indicator"
          size={20}
          color={Colors.textTertiary}
          style={{ opacity: 0.35 }}
        />
        <Pressable
          onPress={onMoveDown}
          disabled={index >= total - 1}
          style={[styles.nudge, index >= total - 1 && styles.nudgeOff]}
        >
          <MaterialIcons
            name="keyboard-arrow-down"
            size={22}
            color={
              index >= total - 1 ? Colors.textTertiary : Colors.textSecondary
            }
          />
        </Pressable>
      </View>
      <Text style={styles.cellQuestion} numberOfLines={3}>
        {question.questionText}
      </Text>
      <View style={styles.rowActions}>
        <IconBtn icon="edit" label="Edit question" onPress={onEdit} />
        <IconBtn icon="archive" label="Archive question" onPress={onArchive} />
        <IconBtn icon="delete" label="Delete question" onPress={onDelete} />
      </View>
    </View>
  );
}

function ArchivedRow({
  question,
  onEdit,
  onUnarchive,
  onDelete,
}: {
  question: Doc<"reviewQuestions">;
  onEdit: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
}) {
  return (
    <View style={styles.archivedRow}>
      <Text style={styles.cellQuestion}>{question.questionText}</Text>
      <View style={styles.rowActions}>
        <IconBtn icon="edit" label="Edit question" onPress={onEdit} />
        <IconBtn icon="unarchive" label="Unarchive question" onPress={onUnarchive} />
        <IconBtn icon="delete" label="Delete question" onPress={onDelete} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  settingsCard: { maxHeight: Platform.OS === "web" ? ("90vh" as any) : 600 },
  settingsScroll: { maxHeight: 360 },
  muted: {
    fontSize: 14,
    color: Colors.textTertiary,
    marginBottom: 8,
    fontStyle: "italic",
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    marginBottom: 12,
  },
  tab: { paddingVertical: 10, paddingHorizontal: 16 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: Colors.primary },
  tabDisabled: { opacity: 0.4 },
  tabText: { fontSize: 14, fontWeight: "600", color: Colors.textSecondary },
  tabTextOn: { color: Colors.primary },
  tabTextDis: { color: Colors.textTertiary },
  addForm: { marginTop: 12, gap: 8 },
  inputLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
    marginBottom: 4,
  },
  outlineInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainer,
    minHeight: 44,
  },
  addActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    marginTop: 4,
  },
  addQuestionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    alignSelf: "flex-start",
  },
  addQuestionBtnText: { fontSize: 14, color: Colors.primary },
  nativeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    gap: 8,
  },
  nativeReorder: { width: 40, alignItems: "center" },
  nudge: { padding: 2 },
  nudgeOff: { opacity: 0.35 },
  cellQuestion: { flex: 1, fontSize: 14, color: Colors.text, minWidth: 0 },
  rowActions: { flexDirection: "row", gap: 4, flexShrink: 0 },
  archivedRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    gap: 8,
  },
  iconHit: { padding: 8 },
  deleteBody: { fontSize: 14, color: Colors.text, marginBottom: 8 },
  deleteWarn: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
});
