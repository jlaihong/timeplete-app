import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  Pressable,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../../../convex/_generated/api";
import { Colors } from "../../../constants/colors";
import { Button } from "../../ui/Button";
import { useAnalyticsState } from "../AnalyticsState";
import { ReviewReflectModal } from "../ReviewReflectModal";
import { ReviewQuestionsSettingsModal } from "../../reviews/ReviewQuestionsSettingsModal";
import { displayReviewQuestions } from "../../../lib/reviewParity";
import { useAuth } from "../../../hooks/useAuth";

/* productivity-one `review-component` in analytics column — header row:
 * "Review" + Reflect link + spacer + settings icon; questions from
 * `displayQuestions`; settings opens `ReviewQuestionsSettingsComponent`. */

export function ReviewSection() {
  const { selectedTab, canonicalReviewDate } = useAnalyticsState();
  const { profileReady } = useAuth();
  const frequency = selectedTab;

  const [reflectOpen, setReflectOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const questions = useQuery(
    api.reviews.searchQuestions,
    profileReady ? { frequency } : "skip",
  );
  const existingAnswers = useQuery(
    api.reviews.searchAnswers,
    profileReady
      ? {
          frequency,
          dayUnderReview: canonicalReviewDate,
        }
      : "skip",
  );
  const bulkUpsert = useMutation(api.reviews.bulkUpsertAnswers);

  const [answers, setAnswers] = useState<Record<string, string>>({});

  const displayQs = useMemo(
    () => displayReviewQuestions(questions, existingAnswers ?? []),
    [questions, existingAnswers]
  );

  useEffect(() => {
    if (existingAnswers) {
      const map: Record<string, string> = {};
      for (const a of existingAnswers) {
        map[a.reviewQuestionId] = a.answerText;
      }
      setAnswers(map);
    }
  }, [existingAnswers, canonicalReviewDate, frequency]);

  const handleSave = async () => {
    if (saving) return;
    const toSave = displayQs.map((q) => ({
      reviewQuestionId: q._id,
      answerText: answers[q._id] ?? "",
      frequency,
      dayUnderReview: canonicalReviewDate,
    }));
    setSaving(true);
    try {
      await bulkUpsert({ answers: toSave });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (Platform.OS === "web") {
        // eslint-disable-next-line no-alert
        window.alert(msg);
      } else {
        Alert.alert("Save failed", msg);
      }
    } finally {
      setSaving(false);
    }
  };

  const showReflect = selectedTab !== "DAILY";

  return (
    <>
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.reviewTitle}>Review</Text>
          {showReflect ? (
            <Pressable
              onPress={() => setReflectOpen(true)}
              accessibilityRole="button"
            >
              <Text style={styles.reflectLink}>Reflect</Text>
            </Pressable>
          ) : null}
          <View style={styles.headerSpacer} />
          <Pressable
            onPress={() => setSettingsOpen(true)}
            accessibilityLabel="Review settings"
            style={styles.settingsHit}
          >
            <Ionicons name="settings-outline" size={22} color={Colors.primary} />
          </Pressable>
        </View>

        {!questions ? (
          <Text style={styles.empty}>Loading...</Text>
        ) : displayQs.length === 0 ? (
          <Text style={styles.empty}>
            Add review questions using the settings icon above.
          </Text>
        ) : (
          <View style={styles.form}>
            {displayQs.map((q) => (
              <View key={q._id} style={styles.questionBlock}>
                <Text style={styles.questionText}>{q.questionText}</Text>
                <TextInput
                  style={styles.answerInput}
                  value={answers[q._id] ?? ""}
                  onChangeText={(text) => {
                    setAnswers((prev) => ({ ...prev, [q._id]: text }));
                  }}
                  placeholder="Your answer..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </View>
            ))}

            <View style={{ marginTop: 8 }}>
              <Button
                title={saving ? "Saving..." : "Save"}
                onPress={handleSave}
                disabled={saving}
                variant="primary"
              />
            </View>
          </View>
        )}
      </View>

      <ReviewQuestionsSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        frequency={frequency}
      />

      {selectedTab !== "DAILY" ? (
        <ReviewReflectModal
          visible={reflectOpen}
          onClose={() => setReflectOpen(false)}
          parentTab={selectedTab}
          canonicalReviewDate={canonicalReviewDate}
          currentFrequency={frequency}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 24,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  reviewTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.text,
  },
  reflectLink: {
    marginLeft: 12,
    fontSize: 13,
    fontWeight: "400",
    color: Colors.primary,
  },
  headerSpacer: { flex: 1 },
  settingsHit: { padding: 4 },
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
  },
  form: { marginTop: 4 },
  questionBlock: { marginBottom: 16 },
  questionText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 4,
  },
  answerInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
});
