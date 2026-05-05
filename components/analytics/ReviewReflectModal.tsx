import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import {
  addDays,
  endOfMonth,
  endOfWeek,
  formatDisplayDate,
  getDaysInRange,
  parseYYYYMMDD,
  startOfMonth,
  startOfWeek,
} from "../../lib/dates";
import {
  DialogCard,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";

type ParentTab = "WEEKLY" | "MONTHLY" | "YEARLY";

function weekStartsInWindow(windowStart: string, windowEnd: string): string[] {
  const set = new Set<string>();
  for (const d of getDaysInRange(windowStart, windowEnd)) {
    set.add(startOfWeek(d));
  }
  return [...set].sort();
}

function monthStartsInWindow(windowStart: string, windowEnd: string): string[] {
  const out: string[] = [];
  let cur = startOfMonth(windowStart);
  while (cur <= windowEnd) {
    if (cur >= windowStart) out.push(cur);
    cur = addDays(endOfMonth(cur), 1);
  }
  return out;
}

function monthHeading(yyyymmdd: string): string {
  const d = parseYYYYMMDD(yyyymmdd);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function periodHeading(parentTab: ParentTab, dayKey: string): string {
  switch (parentTab) {
    case "WEEKLY":
      return formatDisplayDate(dayKey);
    case "MONTHLY": {
      const wEnd = endOfWeek(dayKey);
      return `${formatDisplayDate(dayKey)} – ${formatDisplayDate(wEnd)}`;
    }
    case "YEARLY":
      return monthHeading(dayKey);
  }
}

function emptyQuestionsHint(parentTab: ParentTab): string {
  switch (parentTab) {
    case "WEEKLY":
      return "No daily review questions yet. Switch the analytics tab to Daily and add questions above.";
    case "MONTHLY":
      return "No weekly review questions yet. Switch the analytics tab to Weekly and add questions above.";
    case "YEARLY":
      return "No monthly review questions yet. Switch the analytics tab to Monthly and add questions above.";
  }
}

function childFrequencyFor(parentTab: ParentTab): "DAILY" | "WEEKLY" | "MONTHLY" {
  switch (parentTab) {
    case "WEEKLY":
      return "DAILY";
    case "MONTHLY":
      return "WEEKLY";
    case "YEARLY":
      return "MONTHLY";
  }
}

function childReviewKeys(
  parentTab: ParentTab,
  windowStart: string,
  windowEnd: string
): string[] {
  switch (parentTab) {
    case "WEEKLY":
      return getDaysInRange(windowStart, windowEnd);
    case "MONTHLY":
      return weekStartsInWindow(windowStart, windowEnd);
    case "YEARLY":
      return monthStartsInWindow(windowStart, windowEnd);
  }
}

function childListLabel(parentTab: ParentTab): string {
  switch (parentTab) {
    case "WEEKLY":
      return "Daily reviews";
    case "MONTHLY":
      return "Weekly reviews";
    case "YEARLY":
      return "Monthly reviews";
  }
}

export function ReviewReflectModal({
  visible,
  onClose,
  parentTab,
  windowStart,
  windowEnd,
}: {
  visible: boolean;
  onClose: () => void;
  parentTab: ParentTab;
  windowStart: string;
  windowEnd: string;
}) {
  const childFrequency = childFrequencyFor(parentTab);
  const orderedKeys = useMemo(
    () => childReviewKeys(parentTab, windowStart, windowEnd),
    [parentTab, windowStart, windowEnd]
  );

  const rangeStr = `${formatDisplayDate(windowStart)} – ${formatDisplayDate(windowEnd)}`;

  const queryArgs =
    visible && orderedKeys.length > 0
      ? {
          frequency: childFrequency,
          startDate: orderedKeys[0]!,
          endDate: orderedKeys[orderedKeys.length - 1]!,
        }
      : ("skip" as const);

  const flatAnswers = useQuery(api.reviews.searchAnswersRange, queryArgs);
  const questionsRaw = useQuery(
    api.reviews.searchQuestions,
    visible ? { frequency: childFrequency } : "skip"
  );

  const sortedQuestions = useMemo(
    () =>
      questionsRaw
        ?.filter((q) => !q.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex) ?? [],
    [questionsRaw]
  );

  const answersByPeriod = useMemo(() => {
    const m = new Map<string, Map<string, string>>();
    for (const a of flatAnswers ?? []) {
      if (!m.has(a.dayUnderReview)) {
        m.set(a.dayUnderReview, new Map());
      }
      m.get(a.dayUnderReview)!.set(a.reviewQuestionId, a.answerText);
    }
    return m;
  }, [flatAnswers]);

  if (!visible) return null;

  return (
    <DialogOverlay onBackdropPress={onClose} zIndex={2500}>
      <DialogCard
        desktopWidth={580}
        style={[
          styles.card,
          Platform.OS === "web"
            ? ({ maxHeight: "85vh" } as object)
            : { maxHeight: 560 },
        ]}
      >
        <DialogHeader title="Reflect" onClose={onClose} />
        <Text style={styles.subtitle}>
          {childListLabel(parentTab)} · {rangeStr}
        </Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
        >
          {sortedQuestions.length === 0 ? (
            <Text style={styles.muted}>{emptyQuestionsHint(parentTab)}</Text>
          ) : null}

          {orderedKeys.map((dayKey) => {
            const heading = periodHeading(parentTab, dayKey);
            const perQ = answersByPeriod.get(dayKey);
            return (
              <View key={dayKey} style={styles.periodBlock}>
                <Text style={styles.periodTitle}>{heading}</Text>
                {sortedQuestions.map((q) => {
                  const text = perQ?.get(q._id) ?? "";
                  const hasText = text.trim().length > 0;
                  return (
                    <View key={q._id} style={styles.qaBlock}>
                      <Text style={styles.questionLabel}>{q.questionText}</Text>
                      <Text
                        style={[
                          styles.answerText,
                          !hasText && styles.answerEmpty,
                        ]}
                      >
                        {hasText ? text : "—"}
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "column",
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  scroll: {
    flexGrow: 1,
    minHeight: 120,
    maxHeight: Platform.OS === "web" ? (480 as const) : 440,
  },
  scrollInner: {
    paddingBottom: 8,
  },
  muted: {
    fontSize: 13,
    color: Colors.textTertiary,
    marginBottom: 12,
    lineHeight: 18,
  },
  periodBlock: {
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  periodTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.text,
    marginBottom: 10,
  },
  qaBlock: {
    marginTop: 10,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 4,
  },
  answerText: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  answerEmpty: {
    color: Colors.textTertiary,
    fontStyle: "italic",
  },
});
