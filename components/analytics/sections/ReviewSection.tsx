import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Button } from "../../ui/Button";
import { SectionCard } from "../SectionCard";
import { useAnalyticsState } from "../AnalyticsState";
import { QuestionSettings } from "../../reviews/QuestionSettings";
import { ReviewReflectModal } from "../ReviewReflectModal";

/* ──────────────────────────────────────────────────────────────────── *
 * Review — productivity-one's fourth column.
 * Frequency = `selectedTab` (Daily/Weekly/Monthly/Yearly).
 * `dayUnderReview` = global `canonicalReviewDate` (mon-of-week,
 *  1st-of-month, jan-1, or selectedDate when daily).
 *
 * Save is local to the section (a network call), but every other
 * filter — frequency and date — is read from the global analytics
 * state. No local navigation chrome here; the page-level
 * AnalyticsTabs + AnalyticsDateNavigator drive both.
 * ──────────────────────────────────────────────────────────────────── */

export function ReviewSection() {
  const { selectedTab, canonicalReviewDate, windowStart, windowEnd } =
    useAnalyticsState();
  const frequency = selectedTab;

  const [reflectOpen, setReflectOpen] = useState(false);

  const questions = useQuery(api.reviews.searchQuestions, { frequency });
  const existingAnswers = useQuery(api.reviews.searchAnswers, {
    frequency,
    dayUnderReview: canonicalReviewDate,
  });
  const bulkUpsert = useMutation(api.reviews.bulkUpsertAnswers);

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);

  const sortedQuestions = useMemo(
    () =>
      questions
        ?.filter((q) => !q.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex) ?? [],
    [questions]
  );

  // Reset the local answer buffer whenever the canonical date or
  // frequency changes — productivity-one's effect-driven approach.
  useEffect(() => {
    if (existingAnswers) {
      const map: Record<string, string> = {};
      for (const a of existingAnswers) {
        map[a.reviewQuestionId] = a.answerText;
      }
      setAnswers(map);
      setIsDirty(false);
    }
  }, [existingAnswers, canonicalReviewDate, frequency]);

  const handleSave = async () => {
    const toSave = sortedQuestions.map((q) => ({
      reviewQuestionId: q._id,
      answerText: answers[q._id] ?? "",
      frequency,
      dayUnderReview: canonicalReviewDate,
    }));
    if (toSave.length === 0) return;
    try {
      await bulkUpsert({ answers: toSave });
      setIsDirty(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Save failed", msg);
      }
    }
  };

  const showReflect = selectedTab !== "DAILY";

  return (
    <>
      <SectionCard
        title="Review"
        right={
          showReflect ? (
            <Button
              title="Reflect"
              variant="outline"
              onPress={() => setReflectOpen(true)}
            />
          ) : undefined
        }
      >
        <QuestionSettings frequency={frequency} />

        {!questions ? (
          <Text style={styles.empty}>Loading…</Text>
        ) : sortedQuestions.length === 0 ? (
          <Text style={styles.empty}>
            No review questions for this frequency yet. Add some above.
          </Text>
        ) : (
          <View style={{ marginTop: 8 }}>
            {sortedQuestions.map((q) => (
              <View key={q._id} style={styles.questionBlock}>
                <Text style={styles.questionText}>{q.questionText}</Text>
                <TextInput
                  style={styles.answerInput}
                  value={answers[q._id] ?? ""}
                  onChangeText={(text) => {
                    setAnswers((prev) => ({ ...prev, [q._id]: text }));
                    setIsDirty(true);
                  }}
                  placeholder="Write your answer…"
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ))}

            <View style={{ marginTop: 4 }}>
              <Button
                title={isDirty ? "Save Answers" : "Saved"}
                onPress={handleSave}
                disabled={!isDirty}
                variant={isDirty ? "primary" : "secondary"}
              />
            </View>
          </View>
        )}
      </SectionCard>

      {selectedTab !== "DAILY" ? (
        <ReviewReflectModal
          visible={reflectOpen}
          onClose={() => setReflectOpen(false)}
          parentTab={selectedTab}
          windowStart={windowStart}
          windowEnd={windowEnd}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
  questionBlock: { marginBottom: 12 },
  questionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 6,
  },
  answerInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 13,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
});
