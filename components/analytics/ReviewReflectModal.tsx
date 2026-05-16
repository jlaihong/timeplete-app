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
} from "react-native";
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
import { UnsavedReviewChangesDialog } from "./UnsavedReviewChangesDialog";

type ParentTab = Exclude<ReviewFrequency, "DAILY">;

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
              Platform.OS === "web" && styles.reflectContentWeb,
            ]}
          >
            <View style={styles.reflectColumns}>
              <ScrollView
                style={[styles.reflectColumn, styles.reflectChildColumn]}
                contentContainerStyle={styles.columnPad}
              >
                <Text style={styles.columnHeading}>{childHeading}</Text>
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
                            <Text style={styles.questionLabel}>
                              {q.questionText}
                            </Text>
                            <Text style={styles.answerText}>{answer}</Text>
                          </View>
                        );
                      })}
                    </View>
                  );
                })}
                {datesWithAnswers.length === 0 ? (
                  <Text style={styles.emptyState}>
                    No {meta.childLabel.toLowerCase()} reviews found for this
                    period.
                  </Text>
                ) : null}
              </ScrollView>

              <ScrollView
                style={styles.reflectColumn}
                contentContainerStyle={styles.columnPad}
              >
                <Text style={styles.columnHeading}>{currentHeading}</Text>
                {displayCurrentQs.length === 0 ? (
                  <Text style={styles.emptyState}>
                    No questions configured for{" "}
                    {meta.currentLabel.toLowerCase()} reviews.
                  </Text>
                ) : (
                  displayCurrentQs.map((q) => (
                    <View key={q._id} style={styles.currentField}>
                      <Text style={styles.currentLabel}>{q.questionText}</Text>
                      <TextInput
                        style={styles.currentTextarea}
                        value={answerTexts[q._id] ?? ""}
                        onChangeText={(t) =>
                          setAnswerTexts((prev) => ({ ...prev, [q._id]: t }))
                        }
                        placeholder="Your answer..."
                        placeholderTextColor={Colors.textTertiary}
                        multiline
                        textAlignVertical="top"
                      />
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>

          <DialogFooter>
            <Button
              title="Cancel"
              variant="ghost"
              onPress={requestCloseMain}
            />
            <Button
              title="Save"
              loading={saving}
              disabled={saving}
              onPress={() => void finalizeSave(true)}
            />
          </DialogFooter>
        </DialogCard>
      </DialogOverlay>

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
});
