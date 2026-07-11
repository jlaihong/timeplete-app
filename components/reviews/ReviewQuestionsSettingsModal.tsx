/**
 * productivity-one `ReviewQuestionsSettingsComponent` — dialog title
 * "Review questions", Active / Archived tabs, table with drag reorder,
 * edit / archive / delete, add-question flow. Width 560px.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
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
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { EmptyState } from "../ui/EmptyState";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import type { ReviewFrequency } from "../../lib/reviewParity";
import { useAuth } from "../../hooks/useAuth";

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
  const { profileReady } = useAuth();
  const questions = useQuery(
    api.reviews.searchQuestions,
    visible && profileReady ? { frequency } : "skip",
  );
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

  // The component stays mounted while hidden (`visible` gate below), so
  // without this a reopened dialog resumes wherever it was left — e.g. on
  // the Archived tab with a half-typed add form.
  useEffect(() => {
    if (!visible) return;
    setTab("active");
    setShowAddInput(false);
    setNewQuestionText("");
    setEditTarget(null);
  }, [visible]);

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

  // App-standard destructive confirm (same pattern as deleting a
  // trackable / list): native Alert or window.confirm, with the
  // "answers are deleted too" consequence spelled out.
  const confirmDeleteQuestion = (q: Doc<"reviewQuestions">) => {
    const doDelete = async () => {
      await removeQuestion({ id: q._id });
    };
    const consequence = "This will also delete all answers to this question.";
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${q.questionText}"?\n\n${consequence}`)) {
        void doDelete();
      }
      return;
    }
    Alert.alert("Delete question?", `"${q.questionText}"\n\n${consequence}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => void doDelete() },
    ]);
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
                    onPress={() => setTab("archived")}
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

                {(() => {
                  // Scroll region holds ONLY the question list; the Add
                  // affordance is pinned below it so it never disappears
                  // under the fold of a long list.
                  const body = (
                    <>
                      {tab === "active" ? (
                        <>
                          {activeQuestions.length === 0 ? (
                            <EmptyState
                              fillScreen={false}
                              title="No questions yet"
                              message="Questions you add appear in every review of this frequency."
                            />
                          ) : null}

                          {Platform.OS === "web" ? (
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={onDragEndActive}
                            >
                              <SortableContext
                                items={activeQuestions.map((q) => q._id)}
                                strategy={verticalListSortingStrategy}
                              >
                                {activeQuestions.map((q) => (
                                  <WebQuestionSortRow
                                    key={q._id}
                                    question={q}
                                    onEdit={() => openEdit(q)}
                                    onArchive={() =>
                                      archiveQuestion({ id: q._id })
                                    }
                                    onDelete={() => confirmDeleteQuestion(q)}
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
                                onArchive={() =>
                                  archiveQuestion({ id: q._id })
                                }
                                onDelete={() => confirmDeleteQuestion(q)}
                              />
                            ))
                          )}
                        </>
                      ) : archivedQuestions.length === 0 ? (
                        <EmptyState
                          fillScreen={false}
                          title="No archived questions"
                        />
                      ) : (
                        archivedQuestions.map((q) => (
                          <ArchivedRow
                            key={q._id}
                            question={q}
                            onEdit={() => openEdit(q)}
                            onUnarchive={() =>
                              archiveQuestion({ id: q._id })
                            }
                            onDelete={() => confirmDeleteQuestion(q)}
                          />
                        ))
                      )}
                    </>
                  );

                  /*
                   * RN-web ScrollView does not size raw DOM children from
                   * @dnd-kit (`<div>` sortable rows), so the Active list can
                   * measure as empty. Use overflow:auto on web only.
                   */
                  return Platform.OS === "web" ? (
                    <View key={tab} style={styles.settingsBodyWeb}>
                      {body}
                    </View>
                  ) : (
                    <KeyboardAwareScrollView
                      key={tab}
                      style={styles.settingsScroll}
                      keyboardShouldPersistTaps="handled"
                      bottomOffset={120}
                      // Hide the vertical scrollbar so it doesn't overlap
                      // inputs below (RN draws the indicator inside the
                      // viewport).
                      showsVerticalScrollIndicator={false}
                    >
                      {body}
                    </KeyboardAwareScrollView>
                  );
                })()}

                {tab === "active" ? (
                  showAddInput ? (
                    <View style={styles.addForm}>
                      <Input
                        label="New question"
                        value={newQuestionText}
                        onChangeText={setNewQuestionText}
                        placeholder="e.g. What went well?"
                        autoFocus
                        onSubmitEditing={addQuestion}
                        returnKeyType="done"
                      />
                      <View style={styles.addActions}>
                        <Button
                          title="Cancel"
                          variant="ghost"
                          onPress={() => {
                            setShowAddInput(false);
                            setNewQuestionText("");
                          }}
                          size="small"
                        />
                        <Button
                          title="Add"
                          onPress={addQuestion}
                          disabled={!newQuestionText.trim()}
                          size="small"
                        />
                      </View>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.addQuestionBtn}
                      onPress={() => setShowAddInput(true)}
                    >
                      <Ionicons
                        name="add"
                        size={20}
                        color={Colors.primary}
                      />
                      <Text style={styles.addQuestionBtnText}>
                        Add question
                      </Text>
                    </Pressable>
                  )
                ) : null}

                <DialogFooter>
                  <Button
                    title="Close"
                    variant="ghost"
                    onPress={onClose}
                    size="small"
                  />
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
              <Input
                label="Question"
                value={editText}
                onChangeText={setEditText}
                placeholder="e.g. What went well?"
                autoFocus
                onSubmitEditing={saveEdit}
                returnKeyType="done"
              />
              <DialogFooter>
                <Button
                  title="Cancel"
                  variant="ghost"
                  onPress={() => setEditTarget(null)}
                  size="small"
                />
                <Button
                  title="Save"
                  onPress={saveEdit}
                  disabled={!editText.trim()}
                  size="small"
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
          width: 28,
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
      {/* Up/down nudges only — a drag glyph that can't be dragged is a
          false affordance on touch. */}
      <View style={styles.nativeReorder}>
        <Pressable
          onPress={onMoveUp}
          disabled={index === 0}
          hitSlop={6}
          accessibilityLabel="Move question up"
          style={[styles.nudge, index === 0 && styles.nudgeOff]}
        >
          <MaterialIcons
            name="keyboard-arrow-up"
            size={22}
            color={index === 0 ? Colors.textTertiary : Colors.textSecondary}
          />
        </Pressable>
        <Pressable
          onPress={onMoveDown}
          disabled={index >= total - 1}
          hitSlop={6}
          accessibilityLabel="Move question down"
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
  // `flexShrink: 1` (RN default 0) lets the list give up height when the
  // card is height-capped (native keyboard open, or the 600pt cap above)
  // so the pinned Add affordance + Close footer stay visible; content
  // beyond that scrolls. No fixed maxHeight — the card's cap drives it,
  // so tall phones see more of the list.
  settingsScroll: { flexGrow: 0, flexShrink: 1 },
  settingsBodyWeb: {
    maxHeight: 360,
    width: "100%",
    ...Platform.select({
      web: {
        overflowY: "auto",
        overflowX: "hidden",
      },
      default: {},
    }),
  },
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
  // Pinned below the scroll region (never under the fold of a long list).
  addForm: { marginTop: 12, flexShrink: 0 },
  addActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  addQuestionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 12,
    paddingVertical: 6,
    alignSelf: "flex-start",
    flexShrink: 0,
  },
  addQuestionBtnText: { fontSize: 14, fontWeight: "600", color: Colors.primary },
  nativeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    gap: 8,
  },
  nativeReorder: { width: 28, alignItems: "center" },
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
});
