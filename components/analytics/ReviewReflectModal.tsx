/**
 * productivity-one `ReflectDialogComponent` — title `Reflect — {Current} Review`,
 * two columns (child reviews read-only | current review editable), footer
 * Cancel / Save, content height ~70vh, 90vw max 1200px.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  Alert,
  Pressable,
  useWindowDimensions,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import {
  displayReviewQuestions,
  getChildDateLabel,
  getReflectMeta,
  type ReviewFrequency,
} from "../../lib/reviewParity";
import { useAuth } from "../../hooks/useAuth";
import { AnswerEditorSheet } from "../reviews/AnswerEditorSheet";
import { UnsavedReviewChangesDialog } from "./UnsavedReviewChangesDialog";

type ParentTab = Exclude<ReviewFrequency, "DAILY">;

/** Native swaps inline answer inputs for the full-height editor sheet. */
const useSheetEditing = Platform.OS !== "web";

type ReflectDraft = { dirty: boolean; save: () => Promise<void> } | null;

export function ReviewReflectModal({
  visible,
  onClose,
  onSaved,
  parentTab,
  canonicalReviewDate,
  currentFrequency,
  onDraftStateChange,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: () => void;
  parentTab: ParentTab;
  canonicalReviewDate: string;
  currentFrequency: ReviewFrequency;
  /** Parent may register drafts for analytics tab/date guards. */
  onDraftStateChange?: (draft: ReflectDraft) => void;
}) {
  const { profileReady } = useAuth();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Side-by-side columns need real width for each column to be a usable
  // reading/writing surface. Below the app's desktop breakpoint, show one
  // full-width pane at a time behind a segmented toggle instead.
  const isCompact = windowWidth < 768;
  const meta = useMemo(
    () => getReflectMeta(parentTab, canonicalReviewDate),
    [parentTab, canonicalReviewDate]
  );

  const rangeQuery =
    visible && meta && profileReady
      ? {
          frequency: meta.childFrequency,
          startDate: meta.startDate,
          endDate: meta.endDate,
        }
      : ("skip" as const);

  const childAnswersFlat = useQuery(api.reviews.searchAnswersRange, rangeQuery);
  const childQuestionsRaw = useQuery(
    api.reviews.searchQuestions,
    visible && profileReady && meta
      ? { frequency: meta.childFrequency }
      : "skip"
  );
  const currentQuestionsRaw = useQuery(
    api.reviews.searchQuestions,
    visible && profileReady ? { frequency: currentFrequency } : "skip"
  );
  const currentAnswers = useQuery(
    api.reviews.searchAnswers,
    visible && profileReady
      ? {
          frequency: currentFrequency,
          dayUnderReview: canonicalReviewDate,
        }
      : "skip"
  );

  const bulkUpsert = useMutation(api.reviews.bulkUpsertAnswers);

  const childQuestions = useMemo(
    () =>
      (childQuestionsRaw ?? [])
        .filter((q) => !q.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex),
    [childQuestionsRaw]
  );

  const displayCurrentQs = useMemo(
    () =>
      displayReviewQuestions(currentQuestionsRaw, currentAnswers ?? []),
    [currentQuestionsRaw, currentAnswers]
  );

  const childAnswersByDate = useMemo(() => {
    const m = new Map<string, typeof childAnswersFlat>();
    for (const a of childAnswersFlat ?? []) {
      const list = m.get(a.dayUnderReview) ?? [];
      list.push(a);
      m.set(a.dayUnderReview, list);
    }
    return m;
  }, [childAnswersFlat]);

  const orderedDates = useMemo(
    () => [...childAnswersByDate.keys()].sort(),
    [childAnswersByDate]
  );

  const dateLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const d of orderedDates) {
      labels.set(d, getChildDateLabel(meta.childFrequency, d));
    }
    return labels;
  }, [orderedDates, meta.childFrequency]);

  const [answerTexts, setAnswerTexts] = useState<Record<string, string>>({});
  const [initialTexts, setInitialTexts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [unsavedDismissOpen, setUnsavedDismissOpen] = useState(false);
  const [segment, setSegment] = useState<"past" | "current">("past");
  const [editingQuestion, setEditingQuestion] = useState<{
    id: string;
    questionText: string;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;
    // Fresh open: start on the read-back pane and no editor sheet.
    setSegment("past");
    setEditingQuestion(null);
  }, [visible]);

  useEffect(() => {
    if (!visible || !currentAnswers) return;
    const next: Record<string, string> = {};
    for (const a of currentAnswers) {
      next[a.reviewQuestionId] = a.answerText ?? "";
    }
    setAnswerTexts({ ...next });
    setInitialTexts({ ...next });
    setUnsavedDismissOpen(false);
  }, [visible, currentAnswers, canonicalReviewDate, currentFrequency]);

  const isDirty = useMemo(() => {
    for (const [qId, text] of Object.entries(answerTexts)) {
      if ((text || "") !== (initialTexts[qId] || "")) return true;
    }
    for (const [qId, text] of Object.entries(initialTexts)) {
      if ((text || "") !== (answerTexts[qId] || "")) return true;
    }
    return false;
  }, [answerTexts, initialTexts]);

  const performSaveToServer = useCallback(async () => {
    const toSave = displayCurrentQs.map((q) => ({
      reviewQuestionId: q._id,
      answerText: answerTexts[q._id] ?? "",
      frequency: currentFrequency,
      dayUnderReview: canonicalReviewDate,
    }));
    if (toSave.length > 0) {
      await bulkUpsert({ answers: toSave });
    }
    setInitialTexts({ ...answerTexts });
  }, [
    displayCurrentQs,
    answerTexts,
    currentFrequency,
    canonicalReviewDate,
    bulkUpsert,
  ]);

  const finalizeSave = useCallback(
    async (closeModal: boolean) => {
      setSaving(true);
      try {
        await performSaveToServer();
        onSaved?.();
        if (closeModal) onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed";
        if (Platform.OS === "web") {
          // eslint-disable-next-line no-alert
          window.alert(msg);
        } else Alert.alert("Save failed", msg);
        throw e;
      } finally {
        setSaving(false);
      }
    },
    [performSaveToServer, onSaved, onClose]
  );

  useEffect(() => {
    if (!onDraftStateChange) return;
    if (!visible) {
      onDraftStateChange(null);
      return;
    }
    onDraftStateChange({
      dirty: isDirty,
      save: () => finalizeSave(true),
    });
  }, [visible, isDirty, onDraftStateChange, finalizeSave]);

  const getAnswerForQuestion = useCallback(
    (date: string, questionId: string): string => {
      const answers = childAnswersByDate.get(date) ?? [];
      return (
        answers.find((a) => a.reviewQuestionId === questionId)?.answerText ??
        ""
      );
    },
    [childAnswersByDate]
  );

  const datesWithAnswers = useMemo(
    () =>
      orderedDates.filter(
        (d) => (childAnswersByDate.get(d)?.length ?? 0) > 0
      ),
    [orderedDates, childAnswersByDate]
  );

  const requestCloseMain = () => {
    setUnsavedDismissOpen(false);
    if (!isDirty) {
      onClose();
      return;
    }
    setUnsavedDismissOpen(true);
  };

  const confirmDiscardDismiss = () => {
    setUnsavedDismissOpen(false);
    onClose();
  };

  if (!visible) return null;

  const title = `Reflect — ${meta.currentLabel} Review`;
  const childHeading = `${meta.childLabel} Reviews`;
  const currentHeading = `${meta.currentLabel} Review`;

  // On compact the segmented toggle already names the pane, so the
  // in-column headings are only rendered on desktop.
  const childColumn = (
    <ScrollView
      style={[
        styles.reflectColumn,
        !isCompact && styles.reflectChildColumn,
      ]}
      contentContainerStyle={styles.columnPad}
    >
      {!isCompact ? (
        <Text style={styles.columnHeading}>{childHeading}</Text>
      ) : null}
      {datesWithAnswers.map((date) => {
        const answersForDate = childAnswersByDate.get(date);
        if (!answersForDate || answersForDate.length === 0) return null;
        return (
          <View key={date} style={styles.dateGroup}>
            <Text style={styles.dateHeading}>
              {dateLabels.get(date) ?? date}
            </Text>
            {childQuestions.map((q) => {
              const answer = getAnswerForQuestion(date, q._id);
              if (!answer) return null;
              return (
                <View key={q._id} style={styles.qaPair}>
                  <Text style={styles.questionLabel}>{q.questionText}</Text>
                  <Text style={styles.answerText}>{answer}</Text>
                </View>
              );
            })}
          </View>
        );
      })}
      {datesWithAnswers.length === 0 ? (
        <Text style={styles.emptyState}>
          No {meta.childLabel.toLowerCase()} reviews found for this period.
        </Text>
      ) : null}
    </ScrollView>
  );

  const currentColumn = (
    <KeyboardAwareScrollView
      style={styles.reflectColumn}
      contentContainerStyle={styles.columnPad}
      keyboardShouldPersistTaps="handled"
      bottomOffset={120}
      // Hide the vertical scrollbar so it doesn't overlap inputs
      // below (RN draws the indicator inside the viewport).
      showsVerticalScrollIndicator={false}
    >
      {!isCompact ? (
        <Text style={styles.columnHeading}>{currentHeading}</Text>
      ) : null}
      {displayCurrentQs.length === 0 ? (
        <Text style={styles.emptyState}>
          No questions configured for {meta.currentLabel.toLowerCase()}{" "}
          reviews.
        </Text>
      ) : (
        displayCurrentQs.map((q) => {
          const answer = answerTexts[q._id] ?? "";
          return (
            <View key={q._id} style={styles.currentField}>
              <Text style={styles.currentLabel}>{q.questionText}</Text>
              {useSheetEditing ? (
                <Pressable
                  style={styles.currentPreview}
                  onPress={() =>
                    setEditingQuestion({
                      id: q._id,
                      questionText: q.questionText,
                    })
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Answer: ${q.questionText}`}
                >
                  {answer ? (
                    <Text style={styles.answerText}>{answer}</Text>
                  ) : (
                    <Text style={styles.currentPlaceholder}>
                      Tap to answer...
                    </Text>
                  )}
                </Pressable>
              ) : (
                <TextInput
                  style={styles.currentTextarea}
                  value={answer}
                  onChangeText={(t) =>
                    setAnswerTexts((prev) => ({ ...prev, [q._id]: t }))
                  }
                  placeholder="Your answer..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              )}
            </View>
          );
        })
      )}
    </KeyboardAwareScrollView>
  );

  return (
    <>
      <DialogOverlay onBackdropPress={requestCloseMain} zIndex={2500}>
        <DialogCard
          desktopWidth={1200}
          style={[
            styles.reflectCard,
            Platform.OS === "web"
              ? ({ width: "90vw", maxWidth: 1200 } as object)
              : null,
          ]}
        >
          <DialogHeader title={title} onClose={requestCloseMain} />
          <View
            style={[
              styles.reflectContent,
              // Web mirrors productivity-one's fixed 70vh content region.
              // Native needs an explicit pixel height for the same reason:
              // the columns inside use `flex: 1` (basis 0), so an auto-height
              // parent collapses to 0 and `overflow: hidden` clips everything.
              Platform.OS === "web"
                ? styles.reflectContentWeb
                : { height: Math.round(windowHeight * 0.7) },
            ]}
          >
            {isCompact ? (
              <View style={styles.compactBody}>
                <View style={styles.segmentTabs}>
                  {(
                    [
                      { key: "past", label: childHeading },
                      { key: "current", label: currentHeading },
                    ] as const
                  ).map((s) => (
                    <Pressable
                      key={s.key}
                      style={[
                        styles.segmentTab,
                        segment === s.key && styles.segmentTabActive,
                      ]}
                      onPress={() => setSegment(s.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: segment === s.key }}
                    >
                      <Text
                        style={[
                          styles.segmentTabText,
                          segment === s.key && styles.segmentTabTextActive,
                        ]}
                      >
                        {s.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {segment === "past" ? childColumn : currentColumn}
              </View>
            ) : (
              <View style={styles.reflectColumns}>
                {childColumn}
                {currentColumn}
              </View>
            )}
          </View>

          <DialogFooter>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={requestCloseMain}
              size="small"
            />
            <Button
              title="Save"
              loading={saving}
              disabled={saving}
              onPress={() => void finalizeSave(true)}
              size="small"
            />
          </DialogFooter>
        </DialogCard>
      </DialogOverlay>

      {editingQuestion ? (
        <AnswerEditorSheet
          questionText={editingQuestion.questionText}
          initialText={answerTexts[editingQuestion.id] ?? ""}
          onCancel={() => setEditingQuestion(null)}
          onDone={(text) => {
            setEditingQuestion(null);
            // Draft only — the Reflect footer Save persists all answers,
            // same as the inline inputs on web.
            setAnswerTexts((prev) => ({ ...prev, [editingQuestion.id]: text }));
          }}
        />
      ) : null}

      <UnsavedReviewChangesDialog
        visible={unsavedDismissOpen}
        mode="discard"
        zIndex={3600}
        onDismiss={() => setUnsavedDismissOpen(false)}
        onDiscard={confirmDiscardDismiss}
      />
    </>
  );
}

const styles = StyleSheet.create({
  reflectCard: {
    flexDirection: "column",
    maxHeight: Platform.OS === "web" ? ("92vh" as any) : 720,
  },
  reflectContent: {
    overflow: "hidden",
    // Shrinkable middle region: when the card is height-capped (native
    // keyboard open — see DialogOverlay/useDialogKeyboardShift), this
    // yields height so the DialogFooter below stays visible instead of
    // being clipped by the card's overflow:hidden.
    flexShrink: 1,
    minHeight: 0,
  },
  reflectContentWeb: {
    height: "70vh" as any,
  } as const,
  reflectColumns: {
    flex: 1,
    flexDirection: "row",
    gap: 32,
    minHeight: 280,
    height: "100%",
  },
  reflectChildColumn: {
    paddingRight: 32,
    borderRightWidth: 1,
    borderRightColor: Colors.outlineVariant,
  },
  reflectColumn: {
    flex: 1,
    minWidth: 0,
  },
  columnPad: {
    paddingBottom: 12,
  },
  columnHeading: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 16,
    color: Colors.text,
  },
  dateGroup: {
    marginBottom: 24,
  },
  dateHeading: {
    fontWeight: "600",
    fontSize: 14,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    color: Colors.text,
  },
  qaPair: {
    marginBottom: 12,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: "500",
    opacity: 0.8,
    marginBottom: 2,
    color: Colors.text,
  },
  answerText: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.text,
    ...(Platform.OS === "web"
      ? ({ whiteSpace: "pre-wrap" } as object)
      : null),
  },
  emptyState: {
    opacity: 0.6,
    fontStyle: "italic",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  currentField: {
    marginBottom: 16,
    gap: 4,
  },
  currentLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
  currentTextarea: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainer,
  },
  currentPreview: {
    minHeight: 56,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    backgroundColor: Colors.surfaceContainer,
  },
  currentPlaceholder: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textTertiary,
  },
  compactBody: {
    flex: 1,
    minHeight: 0,
  },
  segmentTabs: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 12,
  },
  segmentTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.surfaceVariant,
    alignItems: "center",
  },
  segmentTabActive: {
    backgroundColor: Colors.primary,
  },
  segmentTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  segmentTabTextActive: {
    color: Colors.onPrimary,
  },
});
