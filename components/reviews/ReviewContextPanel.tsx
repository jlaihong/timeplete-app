/**
 * "What happened" beside a review: the period's tracked time, the tasks
 * completed in it, and (for a week, month or year) the shorter reviews
 * already written inside it. It is there so answers like "Wins" don't have
 * to be written from memory.
 */
import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import { formatSecondsAsHM } from "../../lib/dates";
import { DEFAULT_EVENT_COLOR } from "../../lib/eventColors";
import {
  getChildDateLabel,
  getReflectMeta,
  type ReviewFrequency,
} from "../../lib/reviewParity";
import { MentionText } from "../mentions/MentionText";

const MAX_TIME_ROWS = 8;
const MAX_TASK_ROWS = 12;

export function ReviewContextPanel({
  frequency,
  startDay,
  endDay,
}: {
  frequency: ReviewFrequency;
  /** First and last day of the period under review (YYYYMMDD). */
  startDay: string;
  endDay: string;
}) {
  const { profileReady } = useAuth();
  // A year of time entries and tasks is a lot to load for a side note;
  // the yearly review leans on the monthly reviews instead.
  const showActivity = frequency !== "YEARLY";

  const breakdown = useQuery(
    api.analytics.getTimeBreakdown,
    profileReady && showActivity ? { startDay, endDay } : "skip",
  );
  const completedRaw = useQuery(
    api.tasks.searchWithCriteria,
    profileReady && showActivity
      ? {
          dayRanges: [],
          includeCompleted: true,
          completedStartDay: startDay,
          completedEndDay: endDay,
        }
      : "skip",
  );
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const trackables = useQuery(api.trackables.search, profileReady ? {} : "skip");

  const time = useMemo(() => {
    if (!breakdown || breakdown.windowStart !== startDay) return null;
    const totals = new Map<
      string,
      { name: string; colour: string; seconds: number }
    >();
    let total = 0;
    for (const w of breakdown.timeWindows) {
      if (w.budgetType !== "ACTUAL") continue;
      const seconds = w.durationSeconds ?? 0;
      if (seconds <= 0) continue;
      const task = w.taskId ? breakdown.tasks[w.taskId] : undefined;
      const listId = task?.listId ?? undefined;
      const trackableId =
        w.trackableId ??
        task?.trackableId ??
        (listId ? breakdown.listIdToTrackableId[listId] : undefined);
      const trackable = trackableId
        ? breakdown.trackables[trackableId]
        : undefined;
      const list = listId ? breakdown.lists[listId] : undefined;
      const key = trackable
        ? `t:${trackableId}`
        : list
          ? `l:${listId}`
          : "other";
      const row = totals.get(key) ?? {
        name: trackable?.name ?? list?.name ?? "Everything else",
        colour: trackable?.colour ?? list?.colour ?? DEFAULT_EVENT_COLOR,
        seconds: 0,
      };
      row.seconds += seconds;
      totals.set(key, row);
      total += seconds;
    }
    const rows = [...totals.values()].sort((a, b) => b.seconds - a.seconds);
    return { total, rows };
  }, [breakdown, startDay]);

  const completed = useMemo(() => {
    if (!completedRaw) return null;
    const listById = new Map((lists ?? []).map((l) => [l._id as string, l]));
    const trackableById = new Map(
      (trackables ?? []).map((t) => [t._id as string, t]),
    );
    return completedRaw
      .filter(
        (t) =>
          !!t.dateCompleted &&
          t.dateCompleted >= startDay &&
          t.dateCompleted <= endDay,
      )
      .sort((a, b) => (a.dateCompleted! < b.dateCompleted! ? -1 : 1))
      .map((t) => {
        const trackable = t.trackableId
          ? trackableById.get(t.trackableId as string)
          : undefined;
        const list = t.listId ? listById.get(t.listId as string) : undefined;
        return {
          id: t._id as string,
          name: t.name,
          colour: trackable?.colour ?? list?.colour ?? DEFAULT_EVENT_COLOR,
        };
      });
  }, [completedRaw, lists, trackables, startDay, endDay]);

  const [showAllTasks, setShowAllTasks] = useState(false);
  const [showAllTime, setShowAllTime] = useState(false);
  const timeRows = time
    ? showAllTime
      ? time.rows
      : time.rows.slice(0, MAX_TIME_ROWS)
    : [];
  const taskRows = completed
    ? showAllTasks
      ? completed
      : completed.slice(0, MAX_TASK_ROWS)
    : [];

  return (
    <View style={styles.panel}>
      {frequency !== "DAILY" ? (
        <EarlierReviews frequency={frequency} startDay={startDay} />
      ) : null}

      {showActivity ? (
        <>
          <View style={styles.section}>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Time tracked</Text>
              {time ? (
                <Text style={styles.headingValue}>
                  {formatSecondsAsHM(time.total)}
                </Text>
              ) : null}
            </View>
            {!time ? (
              <Text style={styles.quiet}>Loading…</Text>
            ) : time.rows.length === 0 ? (
              <Text style={styles.quiet}>Nothing tracked.</Text>
            ) : (
              <>
                {timeRows.map((row) => (
                  <View key={row.name} style={styles.timeRow}>
                    <View style={styles.rowTop}>
                      <View
                        style={[styles.dot, { backgroundColor: row.colour }]}
                      />
                      <Text style={styles.rowName} numberOfLines={1}>
                        {row.name}
                      </Text>
                      <Text style={styles.rowValue}>
                        {formatSecondsAsHM(row.seconds)}
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            backgroundColor: row.colour,
                            width: `${Math.max(
                              2,
                              Math.round(
                                (row.seconds / time.rows[0].seconds) * 100,
                              ),
                            )}%`,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ))}
                {time.rows.length > MAX_TIME_ROWS ? (
                  <MoreToggle
                    expanded={showAllTime}
                    hiddenCount={time.rows.length - MAX_TIME_ROWS}
                    onPress={() => setShowAllTime((v) => !v)}
                  />
                ) : null}
              </>
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.headingRow}>
              <Text style={styles.heading}>Completed tasks</Text>
              {completed ? (
                <Text style={styles.headingValue}>{completed.length}</Text>
              ) : null}
            </View>
            {!completed ? (
              <Text style={styles.quiet}>Loading…</Text>
            ) : completed.length === 0 ? (
              <Text style={styles.quiet}>None completed.</Text>
            ) : (
              <>
                {taskRows.map((task) => (
                  <View key={task.id} style={styles.taskRow}>
                    <View
                      style={[styles.dot, { backgroundColor: task.colour }]}
                    />
                    <MentionText
                      text={task.name}
                      style={styles.taskName}
                      numberOfLines={2}
                    />
                  </View>
                ))}
                {completed.length > MAX_TASK_ROWS ? (
                  <MoreToggle
                    expanded={showAllTasks}
                    hiddenCount={completed.length - MAX_TASK_ROWS}
                    onPress={() => setShowAllTasks((v) => !v)}
                  />
                ) : null}
              </>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
}

function MoreToggle({
  expanded,
  hiddenCount,
  onPress,
}: {
  expanded: boolean;
  hiddenCount: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" hitSlop={6}>
      <Text style={styles.more}>
        {expanded ? "Show fewer" : `Show ${hiddenCount} more`}
      </Text>
    </Pressable>
  );
}

/** The shorter reviews written inside this period, to read back. */
function EarlierReviews({
  frequency,
  startDay,
}: {
  frequency: Exclude<ReviewFrequency, "DAILY">;
  startDay: string;
}) {
  const { profileReady } = useAuth();
  const meta = useMemo(
    () => getReflectMeta(frequency, startDay),
    [frequency, startDay],
  );
  const answers = useQuery(
    api.reviews.searchAnswersRange,
    profileReady
      ? {
          frequency: meta.childFrequency,
          startDate: meta.startDate,
          endDate: meta.endDate,
        }
      : "skip",
  );
  const questions = useQuery(
    api.reviews.searchQuestions,
    profileReady ? { frequency: meta.childFrequency } : "skip",
  );

  const byDate = useMemo(() => {
    if (!answers || !questions) return null;
    const order = new Map(questions.map((q) => [q._id as string, q]));
    const dates = new Map<string, { question: string; text: string; at: number }[]>();
    for (const a of answers) {
      const text = (a.answerText ?? "").trim();
      const q = order.get(a.reviewQuestionId as string);
      if (!text || !q) continue;
      const list = dates.get(a.dayUnderReview) ?? [];
      list.push({ question: q.questionText, text, at: q.orderIndex });
      dates.set(a.dayUnderReview, list);
    }
    return [...dates.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, items]) => ({
        date,
        items: items.sort((a, b) => a.at - b.at),
      }));
  }, [answers, questions]);

  const title = `${meta.childLabel} reviews`;

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <Text style={styles.heading}>{title}</Text>
        {byDate ? (
          <Text style={styles.headingValue}>{byDate.length}</Text>
        ) : null}
      </View>
      {!byDate ? (
        <Text style={styles.quiet}>Loading…</Text>
      ) : byDate.length === 0 ? (
        <Text style={styles.quiet}>
          No {meta.childLabel.toLowerCase()} reviews were written in this
          period.
        </Text>
      ) : (
        byDate.map(({ date, items }) => (
          <View key={date} style={styles.earlier}>
            <Text style={styles.earlierDate}>
              {getChildDateLabel(meta.childFrequency, date)}
            </Text>
            {items.map((item, i) => (
              <View key={i} style={styles.earlierItem}>
                <Text style={styles.earlierQuestion}>{item.question}</Text>
                <MentionText text={item.text} style={styles.earlierAnswer} />
              </View>
            ))}
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 24 },
  section: { gap: 8 },
  headingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 8,
  },
  heading: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    letterSpacing: 0.4,
    textTransform: "uppercase",
    color: Colors.textTertiary,
  },
  headingValue: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  quiet: { fontSize: FontSize.body, color: Colors.textTertiary },
  dot: { width: 8, height: 8, borderRadius: Radius.pill },
  timeRow: { gap: 4 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowName: { flex: 1, minWidth: 0, fontSize: FontSize.body, color: Colors.text },
  rowValue: {
    fontSize: FontSize.body,
    color: Colors.textSecondary,
    fontVariant: ["tabular-nums"],
  },
  barTrack: {
    height: 3,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainerHigh,
    marginLeft: 16,
  },
  barFill: { height: 3, borderRadius: Radius.pill, opacity: 0.85 },
  taskRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  taskName: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    lineHeight: 20,
    color: Colors.text,
    marginTop: -5,
  },
  more: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textSecondary,
    paddingVertical: 4,
  },
  earlier: {
    gap: 8,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftColor: Colors.surfaceContainerHighest,
    marginBottom: 8,
  },
  earlierDate: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
  },
  earlierItem: { gap: 2 },
  earlierQuestion: { fontSize: FontSize.caption, color: Colors.textTertiary },
  earlierAnswer: {
    fontSize: FontSize.body,
    lineHeight: 20,
    color: Colors.textSecondary,
  },
});
