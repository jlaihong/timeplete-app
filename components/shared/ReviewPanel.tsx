import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  Pressable,
  Platform,
} from "react-native";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { Card } from "../ui/Card";
import { Button } from "../ui/Button";
import {
  todayYYYYMMDD,
  addDays,
  startOfWeek,
  formatDisplayDate,
} from "../../lib/dates";
import { displayReviewQuestions } from "../../lib/reviewParity";
import { ReviewQuestionsSettingsModal } from "../reviews/ReviewQuestionsSettingsModal";
import { ReviewReflectModal } from "../analytics/ReviewReflectModal";

type Frequency = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";

interface ReviewPanelProps {
  title?: string;
}

export function ReviewPanel({ title }: ReviewPanelProps) {
  const [frequency, setFrequency] = useState<Frequency>("DAILY");
  const [offset, setOffset] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isDirty, setIsDirty] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reflectOpen, setReflectOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const today = todayYYYYMMDD();

  const dayUnderReview = useMemo(() => {
    switch (frequency) {
      case "DAILY":
        return addDays(today, offset);
      case "WEEKLY":
        return startOfWeek(addDays(today, offset * 7));
      case "MONTHLY": {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}01`;
      }
      case "YEARLY": {
        const y = new Date().getFullYear() + offset;
        return `${y}0101`;
      }
    }
  }, [frequency, offset, today]);

  const questions = useQuery(api.reviews.searchQuestions, { frequency });
  const existingAnswers = useQuery(api.reviews.searchAnswers, {
    frequency,
    dayUnderReview,
  });
  const bulkUpsert = useMutation(api.reviews.bulkUpsertAnswers);

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
      setIsDirty(false);
    }
  }, [existingAnswers]);

  const handleSave = async () => {
    if (saving) return;
    const toSave = displayQs.map((q) => ({
      reviewQuestionId: q._id,
      answerText: answers[q._id] ?? "",
      frequency,
      dayUnderReview,
    }));
    setSaving(true);
    try {
      await bulkUpsert({ answers: toSave });
      setIsDirty(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Save failed", msg);
    } finally {
      setSaving(false);
    }
  };

  const handleFrequencySwitch = (f: Frequency) => {
    if (isDirty) {
      Alert.alert("Unsaved Changes", "Save before switching?", [
        {
          text: "Discard",
          onPress: () => {
            setFrequency(f);
            setOffset(0);
          },
        },
        {
          text: "Save",
          onPress: async () => {
            await handleSave();
            setFrequency(f);
            setOffset(0);
          },
        },
      ]);
    } else {
      setFrequency(f);
      setOffset(0);
    }
  };

  const showReflect = frequency !== "DAILY";

  return (
    <View style={styles.container}>
      {title && (
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
      )}

      <View style={styles.freqTabs}>
        {(["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as Frequency[]).map(
          (f) => (
            <TouchableOpacity
              key={f}
              style={[
                styles.freqTab,
                frequency === f && styles.activeFreqTab,
              ]}
              onPress={() => handleFrequencySwitch(f)}
            >
              <Text
                style={[
                  styles.freqTabText,
                  frequency === f && styles.activeFreqTabText,
                ]}
              >
                {f.charAt(0) + f.slice(1).toLowerCase()}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      <View style={styles.navigator}>
        <TouchableOpacity onPress={() => setOffset((o) => o - 1)}>
          <Ionicons name="chevron-back" size={24} color={Colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset(0)}>
          <Text style={styles.dateLabel}>
            {formatDisplayDate(dayUnderReview)}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setOffset((o) => o + 1)}>
          <Ionicons name="chevron-forward" size={24} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.reviewHeaderRow}>
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

      <ScrollView contentContainerStyle={styles.content}>
        {!questions ? (
          <Text style={styles.empty}>Loading...</Text>
        ) : displayQs.length === 0 ? (
          <Text style={styles.empty}>
            Add review questions using the settings icon above.
          </Text>
        ) : (
          <>
            {displayQs.map((q) => (
              <Card key={q._id} style={styles.questionCard}>
                <Text style={styles.questionText}>{q.questionText}</Text>
                <TextInput
                  style={styles.answerInput}
                  value={answers[q._id] ?? ""}
                  onChangeText={(text) => {
                    setAnswers((prev) => ({ ...prev, [q._id]: text }));
                    setIsDirty(true);
                  }}
                  placeholder="Your answer..."
                  placeholderTextColor={Colors.textTertiary}
                  multiline
                  textAlignVertical="top"
                />
              </Card>
            ))}

            <Button
              title={saving ? "Saving..." : "Save"}
              onPress={handleSave}
              disabled={saving}
              variant="primary"
            />
          </>
        )}
      </ScrollView>

      <ReviewQuestionsSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        frequency={frequency}
      />

      {showReflect ? (
        <ReviewReflectModal
          visible={reflectOpen}
          onClose={() => setReflectOpen(false)}
          parentTab={frequency}
          canonicalReviewDate={dayUnderReview}
          currentFrequency={frequency}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  sectionHeader: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainer,
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: Colors.text },
  freqTabs: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 6,
  },
  freqTab: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: Colors.surfaceVariant,
  },
  activeFreqTab: { backgroundColor: Colors.primary },
  freqTabText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  activeFreqTabText: { color: Colors.onPrimary },
  navigator: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 16,
  },
  dateLabel: { fontSize: 15, fontWeight: "600", color: Colors.text },
  reviewHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
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
  content: { padding: 16, paddingBottom: 40 },
  questionCard: { marginBottom: 16 },
  questionText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 10,
  },
  answerInput: {
    minHeight: 80,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainer,
  },
});
