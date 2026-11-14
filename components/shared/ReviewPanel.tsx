import { FontSize, Radius } from "../../theme/tokens";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  ScrollView,
  type LayoutChangeEvent,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { MentionTextInput } from "../mentions/MentionTextInput";
import { MentionText } from "../mentions/MentionText";
import { todayYYYYMMDD } from "../../lib/dates";
import {
  displayReviewQuestions,
  type ReviewFrequency,
} from "../../lib/reviewParity";
import {
  currentPeriodName,
  reviewMarkers,
  reviewPeriodEnd,
  reviewPeriodLabel,
  reviewPeriodStart,
  shiftReviewPeriod,
} from "../../lib/reviewPeriod";
import { ReviewQuestionsSettingsModal } from "../reviews/ReviewQuestionsSettingsModal";
import { AnswerEditorSheet } from "../reviews/AnswerEditorSheet";
import { ReviewContextPanel } from "../reviews/ReviewContextPanel";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";

const FREQUENCIES: { id: ReviewFrequency; label: string }[] = [
  { id: "DAILY", label: "Daily" },
  { id: "WEEKLY", label: "Weekly" },
  { id: "MONTHLY", label: "Monthly" },
  { id: "YEARLY", label: "Yearly" },
];

/**
 * Native uses tap-to-edit answers + a full-height `AnswerEditorSheet`
 * instead of inline inputs: the soft keyboard covers most of a phone
 * screen, so inline multiline editing leaves almost no visible writing
 * surface.
 */
const useSheetEditing = Platform.OS !== "web";

/** Pause in typing after which answers are saved. */
const AUTOSAVE_DELAY_MS = 800;
/** Room needed for the questions and the "what happened" panel side by side. */
const TWO_COLUMN_MIN_WIDTH = 960;

type SaveState = "idle" | "saving" | "saved" | "error";

/**
 * The Reviews page: a period's questions on the left, what actually
 * happened in that period on the right. Answers save as you type.
 */
export function ReviewPanel({
  targetFrequency,
  targetDay,
}: {
  /** A review to open, from the route (see `reviews.tsx`). */
  targetFrequency?: string;
  targetDay?: string;
} = {}) {
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const today = todayYYYYMMDD();

  const [frequency, setFrequency] = useState<ReviewFrequency>("DAILY");
  /** First day of the period under review: the key answers are saved under. */
  const [periodStart, setPeriodStart] = useState(today);
  const periodEnd = reviewPeriodEnd(frequency, periodStart);
  const currentStart = reviewPeriodStart(frequency, today);
  const isCurrent = periodStart === currentStart;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [bodyWidth, setBodyWidth] = useState(0);
  const twoColumns = bodyWidth >= TWO_COLUMN_MIN_WIDTH;
  const [editingQuestion, setEditingQuestion] = useState<{
    id: Id<"reviewQuestions">;
    questionText: string;
  } | null>(null);

  const questions = useQuery(
    api.reviews.searchQuestions,
    profileReady ? { frequency } : "skip",
  );
  const existingAnswers = useQuery(
    api.reviews.searchAnswers,
    profileReady ? { frequency, dayUnderReview: periodStart } : "skip",
  );
  const bulkUpsert = useMutation(api.reviews.bulkUpsertAnswers);

  const displayQs = useMemo(
    () => displayReviewQuestions(questions, existingAnswers ?? []),
    [questions, existingAnswers],
  );

  const savedTexts = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of existingAnswers ?? []) {
      map[a.reviewQuestionId] = a.answerText ?? "";
    }
    return map;
  }, [existingAnswers]);

  /* ── Drafts and autosave ─────────────────────────────────────────────
   * `drafts` holds only what has been typed and not yet confirmed by the
   * server; everything else reads straight from the saved answers. A
   * draft is dropped once the saved text matches it, so the server's echo
   * of a save never overwrites what is still being typed.
   */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const savedRef = useRef(savedTexts);
  savedRef.current = savedTexts;
  const periodRef = useRef({ frequency, periodStart });
  periodRef.current = { frequency, periodStart };
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDrafts((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      for (const [id, text] of Object.entries(prev)) {
        if ((savedTexts[id] ?? "") === text) changed = true;
        else next[id] = text;
      }
      return changed ? next : prev;
    });
  }, [savedTexts]);

  /** Save every unsaved draft now, against the period it was typed in. */
  const flush = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const period = periodRef.current;
    const answers = Object.entries(draftsRef.current)
      .filter(([id, text]) => (savedRef.current[id] ?? "") !== text)
      .map(([id, text]) => ({
        reviewQuestionId: id as Id<"reviewQuestions">,
        answerText: text,
        frequency: period.frequency,
        dayUnderReview: period.periodStart,
      }));
    if (answers.length === 0) return;
    setSaveState("saving");
    bulkUpsert({ answers }).then(
      () => setSaveState("saved"),
      (e) => {
        console.error("[reviews] save failed:", e);
        setSaveState("error");
      },
    );
  }, [bulkUpsert]);

  // Leaving the page saves whatever is still pending.
  useEffect(() => () => flush(), [flush]);

  const setAnswer = (questionId: string, text: string, saveNow = false) => {
    const next = { ...draftsRef.current, [questionId]: text };
    draftsRef.current = next;
    setDrafts(next);
    if (saveNow) {
      flush();
      return;
    }
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  };

  /** Move to another period; anything typed is saved first. */
  const goTo = (nextFrequency: ReviewFrequency, day: string) => {
    flush();
    draftsRef.current = {};
    setDrafts({});
    setSaveState("idle");
    setFrequency(nextFrequency);
    setPeriodStart(reviewPeriodStart(nextFrequency, day));
  };

  // Arriving with a review named in the route opens it.
  useEffect(() => {
    const target = FREQUENCIES.find((f) => f.id === targetFrequency);
    if (target && targetDay && /^\d{8}$/.test(targetDay)) {
      goTo(target.id, targetDay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetFrequency, targetDay]);

  /* ── "Reviewed" markers for the neighbouring periods ───────────────── */
  const markers = useMemo(
    () => reviewMarkers(frequency, periodStart),
    [frequency, periodStart],
  );
  const markerAnswers = useQuery(
    api.reviews.searchAnswersRange,
    profileReady && markers.length > 0
      ? {
          frequency,
          startDate: markers[0].start,
          endDate: markers[markers.length - 1].start,
        }
      : "skip",
  );
  const reviewedStarts = useMemo(() => {
    const set = new Set<string>();
    for (const a of markerAnswers ?? []) {
      if ((a.answerText ?? "").trim()) set.add(a.dayUnderReview);
    }
    return set;
  }, [markerAnswers]);

  /* ── Pieces ────────────────────────────────────────────────────────── */
  const tabs = (
    <View style={styles.tabs} accessibilityRole="tablist">
      {FREQUENCIES.map((f) => {
        const active = frequency === f.id;
        return (
          <Pressable
            key={f.id}
            onPress={() => goTo(f.id, today)}
            style={[styles.tab, active && styles.tabActive]}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
              {f.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const periodNav = (
    <View style={styles.nav}>
      <NavChevron
        direction="back"
        onPress={() =>
          goTo(frequency, shiftReviewPeriod(frequency, periodStart, -1))
        }
      />
      <Text style={styles.periodLabel}>
        {reviewPeriodLabel(frequency, periodStart)}
      </Text>
      <NavChevron
        direction="forward"
        onPress={() =>
          goTo(frequency, shiftReviewPeriod(frequency, periodStart, 1))
        }
      />
      {!isCurrent ? (
        <Pressable
          onPress={() => goTo(frequency, today)}
          accessibilityRole="button"
          hitSlop={6}
          style={styles.currentLink}
        >
          <Text style={styles.currentLinkText}>
            {currentPeriodName(frequency)}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const saveStatus =
    saveState === "idle" ? null : (
      <Text
        style={[styles.saveStatus, saveState === "error" && styles.saveError]}
        accessibilityLiveRegion="polite"
      >
        {saveState === "saving"
          ? "Saving…"
          : saveState === "saved"
            ? "Saved"
            : "Couldn't save. Keep typing to retry."}
      </Text>
    );

  const editQuestions = (
    <Pressable
      onPress={() => setSettingsOpen(true)}
      accessibilityRole="button"
      style={(state) => [
        styles.editQuestions,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.editQuestionsHover,
      ]}
    >
      <Ionicons name="create-outline" size={16} color={Colors.textSecondary} />
      <Text style={styles.editQuestionsText}>Edit questions</Text>
    </Pressable>
  );

  const markerRow =
    markers.length > 0 ? (
      <View style={styles.markers}>
        {markers.map((m) => {
          const selected = m.start === periodStart;
          const reviewed = reviewedStarts.has(m.start);
          const label = reviewPeriodLabel(frequency, m.start);
          return (
            <Pressable
              key={m.start}
              onPress={() => goTo(frequency, m.start)}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${
                reviewed ? "reviewed" : "not reviewed"
              }`}
              accessibilityState={{ selected }}
              style={(state) => [
                styles.marker,
                selected && styles.markerSelected,
                !selected &&
                  ((state as { hovered?: boolean }).hovered || state.pressed) &&
                  styles.markerHover,
              ]}
            >
              <Text
                style={[
                  styles.markerLabel,
                  selected && styles.markerLabelSelected,
                  m.start > currentStart && styles.markerLabelFuture,
                ]}
              >
                {m.label}
              </Text>
              <View
                style={[styles.markerDot, reviewed && styles.markerDotDone]}
              />
            </Pressable>
          );
        })}
      </View>
    ) : null;

  const questionList = !questions ? (
    <Text style={styles.empty}>Loading…</Text>
  ) : displayQs.length === 0 ? (
    <View style={styles.emptyBlock}>
      <Text style={styles.empty}>
        No {FREQUENCIES.find((f) => f.id === frequency)!.label.toLowerCase()}{" "}
        questions yet.
      </Text>
      {editQuestions}
    </View>
  ) : (
    displayQs.map((q) => {
      const answer = drafts[q._id] ?? savedTexts[q._id] ?? "";
      return (
        <View key={q._id} style={styles.question}>
          <Text style={styles.questionText}>{q.questionText}</Text>
          {useSheetEditing ? (
            <Pressable
              style={styles.answerPreview}
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
                <MentionText text={answer} style={styles.answerPreviewText} />
              ) : (
                <Text style={styles.placeholder}>Tap to answer</Text>
              )}
            </Pressable>
          ) : (
            <MentionTextInput
              autoGrow
              style={styles.answerInput}
              value={answer}
              onChangeText={(text) => setAnswer(q._id, text)}
              onBlur={flush}
              placeholder="Write here"
              placeholderTextColor={Colors.textTertiary}
              accessibilityLabel={q.questionText}
            />
          )}
        </View>
      );
    })
  );

  const context = (
    <ReviewContextPanel
      frequency={frequency}
      startDay={periodStart}
      endDay={periodEnd}
    />
  );

  return (
    <View style={styles.container}>
      {isDesktop ? (
        // Title, period and date share one row, as on Analytics.
        <View style={styles.toolbar}>
          <Text style={styles.title} accessibilityRole="header">
            Reviews
          </Text>
          {tabs}
          {periodNav}
          <View style={styles.spacer} />
          {saveStatus}
          {editQuestions}
        </View>
      ) : (
        <View style={styles.mobileHeader}>
          <View style={styles.mobileRow}>
            {tabs}
            <View style={styles.spacer} />
            <Pressable
              onPress={() => setSettingsOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Edit questions"
              hitSlop={8}
            >
              <Ionicons
                name="create-outline"
                size={22}
                color={Colors.textSecondary}
              />
            </Pressable>
          </View>
          <View style={styles.mobileRow}>
            {periodNav}
            <View style={styles.spacer} />
            {saveStatus}
          </View>
        </View>
      )}

      <View
        style={styles.body}
        onLayout={(e: LayoutChangeEvent) =>
          setBodyWidth(e.nativeEvent.layout.width)
        }
      >
        {twoColumns ? (
          <View style={styles.columns}>
            <ScrollView
              style={styles.mainCol}
              contentContainerStyle={styles.colContent}
              keyboardShouldPersistTaps="handled"
            >
              {markerRow}
              {questionList}
            </ScrollView>
            <ScrollView
              style={styles.sideCol}
              contentContainerStyle={styles.colContent}
            >
              {context}
            </ScrollView>
          </View>
        ) : (
          <KeyboardAwareScrollView
            contentContainerStyle={styles.stackContent}
            keyboardShouldPersistTaps="handled"
            bottomOffset={120}
          >
            {markerRow}
            {questionList}
            <Pressable
              onPress={() => setContextOpen((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: contextOpen }}
              style={styles.contextToggle}
            >
              <Ionicons
                name={contextOpen ? "chevron-down" : "chevron-forward"}
                size={16}
                color={Colors.textSecondary}
              />
              <Text style={styles.contextToggleText}>What happened</Text>
            </Pressable>
            {contextOpen ? context : null}
          </KeyboardAwareScrollView>
        )}
      </View>

      {editingQuestion ? (
        <AnswerEditorSheet
          questionText={editingQuestion.questionText}
          initialText={
            drafts[editingQuestion.id] ?? savedTexts[editingQuestion.id] ?? ""
          }
          onCancel={() => setEditingQuestion(null)}
          onDone={(text) => {
            const id = editingQuestion.id;
            setEditingQuestion(null);
            setAnswer(id, text, true);
          }}
        />
      ) : null}

      <ReviewQuestionsSettingsModal
        visible={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        frequency={frequency}
      />
    </View>
  );
}

function NavChevron({
  direction,
  onPress,
}: {
  direction: "back" | "forward";
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "back" ? "Previous" : "Next"}
      onPress={onPress}
      hitSlop={6}
      style={(state) => [
        styles.chevron,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.chevronHover,
      ]}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={20}
        color={Colors.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  spacer: { flex: 1 },

  toolbar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 16,
  },
  title: { fontSize: FontSize.title, fontWeight: "600", color: Colors.text },
  mobileHeader: { paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  mobileRow: { flexDirection: "row", alignItems: "center", gap: 8 },

  // Segmented control, matching Analytics: the accent colour is kept for
  // what has been done, not for navigation.
  tabs: {
    flexDirection: "row",
    padding: 3,
    gap: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainer,
  },
  tab: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: Radius.pill },
  tabActive: { backgroundColor: Colors.surfaceContainerHighest },
  tabLabel: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  tabLabelActive: { color: Colors.text },

  nav: { flexDirection: "row", alignItems: "center", gap: 4 },
  periodLabel: {
    minWidth: 96,
    textAlign: "center",
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  chevron: { padding: 4, borderRadius: Radius.pill },
  chevronHover: { backgroundColor: Colors.surfaceContainerHigh },
  currentLink: { marginLeft: 8 },
  currentLinkText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.primary,
  },

  saveStatus: { fontSize: FontSize.caption, color: Colors.textTertiary },
  saveError: { color: Colors.error },
  editQuestions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  editQuestionsHover: { backgroundColor: Colors.surfaceContainerHigh },
  editQuestionsText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },

  body: { flex: 1, minHeight: 0 },
  columns: {
    flex: 1,
    minHeight: 0,
    flexDirection: "row",
    alignSelf: "center",
    width: "100%",
    maxWidth: 1120,
    paddingHorizontal: 16,
    gap: 40,
  },
  mainCol: { flex: 1, minWidth: 0 },
  sideCol: { width: 340, flexGrow: 0 },
  colContent: { paddingTop: 8, paddingBottom: 48 },
  stackContent: { padding: 16, paddingBottom: 48 },

  markers: { flexDirection: "row", gap: 2, marginBottom: 20 },
  marker: {
    minWidth: 32,
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
  },
  markerSelected: { backgroundColor: Colors.surfaceContainerHigh },
  markerHover: { backgroundColor: Colors.surfaceContainer },
  markerLabel: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  markerLabelSelected: { color: Colors.text },
  markerLabelFuture: { color: Colors.textTertiary },
  markerDot: {
    width: 6,
    height: 6,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Colors.textTertiary,
  },
  markerDotDone: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },

  // A question is a label over one writing surface: no card around it.
  question: { marginBottom: 24 },
  questionText: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 8,
  },
  answerInput: {
    minHeight: 96,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.text,
    backgroundColor: Colors.surfaceContainerLow,
  },
  answerPreview: {
    minHeight: 64,
    borderRadius: Radius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.surfaceContainerLow,
  },
  answerPreviewText: {
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.text,
  },
  placeholder: {
    fontSize: FontSize.body,
    lineHeight: 22,
    color: Colors.textTertiary,
  },
  empty: { fontSize: FontSize.body, color: Colors.textTertiary },
  emptyBlock: { gap: 8, paddingVertical: 8, alignItems: "flex-start" },

  contextToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 8,
    marginBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
  },
  contextToggleText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});
