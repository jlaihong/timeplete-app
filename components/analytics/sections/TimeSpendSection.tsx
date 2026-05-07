import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Colors } from "../../../constants/colors";
import {
  formatSecondsAsHM,
  getDaysInRange,
  getWeekdayName,
  parseYYYYMMDD,
} from "../../../lib/dates";
import { SectionCard } from "../SectionCard";
import {
  useAnalyticsDataset,
  type TimeWindowLite,
  type TrackableLite,
} from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";
import { TimeSpendTimelineChart } from "../TimeSpendTimelineChart";

/* ──────────────────────────────────────────────────────────────────── *
 * Time Spend — productivity-one's third column.
 *
 * Daily / Weekly / Monthly: one horizontal 00:00–24:00 track per calendar
 * day; sessions are positioned from real start/end (clipped to each day
 * when a window crosses midnight). Overlaps stack into lanes.
 *
 * Yearly: stacked bars per month (hours axis — unchanged from prior
 * Timeplete behaviour).
 *
 * Summary legend below the chart: per-trackable totals in the window.
 * ──────────────────────────────────────────────────────────────────── */

interface BarSegment {
  trackableId: string | null;
  colour: string;
  seconds: number;
}

interface BarBucket {
  id: string;
  label: string;
  totalSeconds: number;
  segments: BarSegment[];
}

const FALLBACK_COLOUR = Colors.textTertiary;

function bucketIdForWindow(w: TimeWindowLite, isYearly: boolean): string {
  return isYearly ? w.startDayYYYYMMDD.slice(0, 6) : w.startDayYYYYMMDD;
}

function makeYearMonthBuckets(year: number): {
  id: string;
  label: string;
}[] {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return months.map((label, i) => ({
    id: `${year}${String(i + 1).padStart(2, "0")}`,
    label,
  }));
}

function dayLabelForTimeline(day: string, tab: string): string {
  const d = parseYYYYMMDD(day);
  if (tab === "WEEKLY") {
    return getWeekdayName(day);
  }
  if (tab === "MONTHLY") {
    return String(d.getDate());
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function TimeSpendSection() {
  const { selectedTab, windowStart, windowEnd } = useAnalyticsState();
  const dataset = useAnalyticsDataset();

  const isYearly = selectedTab === "YEARLY";

  const timelineDays = useMemo(() => {
    if (isYearly) return [];
    return getDaysInRange(windowStart, windowEnd);
  }, [isYearly, windowStart, windowEnd]);

  const yearlyBuckets = useMemo<BarBucket[]>(() => {
    if (!isYearly) return [];
    const ids = makeYearMonthBuckets(parseInt(windowStart.slice(0, 4), 10));
    const map = new Map<string, Map<string, number>>();
    for (const id of ids.map((b) => b.id)) {
      map.set(id, new Map());
    }
    for (const w of dataset.timeWindows) {
      const bucketId = bucketIdForWindow(w, true);
      const inner = map.get(bucketId);
      if (!inner) continue;
      const tid = dataset.resolveTrackableId(w) ?? "__untracked__";
      inner.set(tid, (inner.get(tid) ?? 0) + w.durationSeconds);
    }
    return ids.map(({ id, label }) => {
      const inner = map.get(id) ?? new Map();
      const segments: BarSegment[] = [];
      let total = 0;
      for (const [tid, seconds] of Array.from(inner.entries())) {
        const trackable =
          tid === "__untracked__" ? null : dataset.trackables[tid];
        segments.push({
          trackableId: tid === "__untracked__" ? null : tid,
          colour: trackable?.colour ?? FALLBACK_COLOUR,
          seconds,
        });
        total += seconds;
      }
      segments.sort((a, b) => b.seconds - a.seconds);
      return { id, label, totalSeconds: total, segments };
    });
  }, [dataset, isYearly, windowStart]);

  const maxYearlyBucketSeconds = useMemo(
    () => Math.max(0, ...yearlyBuckets.map((b) => b.totalSeconds)),
    [yearlyBuckets],
  );

  const legend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const w of dataset.timeWindows) {
      const tid = dataset.resolveTrackableId(w);
      if (!tid) continue;
      totals.set(tid, (totals.get(tid) ?? 0) + w.durationSeconds);
    }
    return Array.from(totals.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([tid, seconds]) => ({
        trackableId: tid,
        seconds,
        trackable: dataset.trackables[tid],
      }))
      .filter(
        (x): x is {
          trackableId: string;
          seconds: number;
          trackable: TrackableLite;
        } => x.trackable != null,
      );
  }, [dataset.timeWindows, dataset.trackables, dataset.resolveTrackableId]);

  const showYearlyScroll = isYearly && yearlyBuckets.length > 14;

  const dayLabelFn = useMemo(
    () => (d: string) => dayLabelForTimeline(d, selectedTab),
    [selectedTab],
  );

  return (
    <SectionCard title="Time Spend">
      {dataset.isLoading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : isYearly ? (
        maxYearlyBucketSeconds === 0 ? (
          <Text style={styles.empty}>No time recorded in this period.</Text>
        ) : (
          <>
            <Text style={styles.totalLabel}>
              Total: {formatSecondsAsHM(dataset.totalSeconds)}
            </Text>
            {showYearlyScroll ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.barsRow}>
                  {yearlyBuckets.map((b) => (
                    <BarColumn
                      key={b.id}
                      bucket={b}
                      maxSeconds={maxYearlyBucketSeconds}
                      isWide={false}
                    />
                  ))}
                </View>
              </ScrollView>
            ) : (
              <View style={styles.barsRow}>
                {yearlyBuckets.map((b) => (
                  <BarColumn
                    key={b.id}
                    bucket={b}
                    maxSeconds={maxYearlyBucketSeconds}
                    isWide={false}
                  />
                ))}
              </View>
            )}
            {legend.length > 0 && <SummaryLegend legend={legend} />}
          </>
        )
      ) : dataset.totalSeconds === 0 ? (
        <Text style={styles.empty}>No time recorded in this period.</Text>
      ) : (
        <>
          <Text style={styles.totalLabel}>
            Total: {formatSecondsAsHM(dataset.totalSeconds)}
          </Text>
          <TimeSpendTimelineChart
            days={timelineDays}
            timeWindows={dataset.timeWindows}
            resolveTrackableId={dataset.resolveTrackableId}
            trackables={dataset.trackables}
            fallbackColour={FALLBACK_COLOUR}
            dayLabel={dayLabelFn}
            rowGap={selectedTab === "DAILY" ? 20 : 36}
          />
          {legend.length > 0 && <SummaryLegend legend={legend} />}
        </>
      )}
    </SectionCard>
  );
}

function SummaryLegend({
  legend,
}: {
  legend: {
    trackableId: string;
    seconds: number;
    trackable: TrackableLite;
  }[];
}) {
  return (
    <View style={styles.legend}>
      {legend.map(({ trackableId, trackable, seconds }) => (
        <View key={trackableId} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: trackable.colour },
            ]}
          />
          <Text style={styles.legendLabel} numberOfLines={1}>
            {trackable.name}
          </Text>
          <Text style={styles.legendValue}>
            {formatSecondsAsHM(seconds)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function BarColumn({
  bucket,
  maxSeconds,
  isWide,
}: {
  bucket: BarBucket;
  maxSeconds: number;
  isWide: boolean;
}) {
  const heightPct =
    maxSeconds > 0 ? (bucket.totalSeconds / maxSeconds) * 100 : 0;

  return (
    <View style={[styles.barCol, isWide && styles.barColWide]}>
      <View style={styles.barTrack}>
        <View style={[styles.barStack, { height: `${heightPct}%` }]}>
          {bucket.segments.map((seg, idx) => {
            const segPct =
              bucket.totalSeconds > 0
                ? (seg.seconds / bucket.totalSeconds) * 100
                : 0;
            return (
              <View
                key={`${seg.trackableId ?? "u"}-${idx}`}
                style={{
                  height: `${segPct}%`,
                  backgroundColor: seg.colour,
                }}
              />
            );
          })}
        </View>
      </View>
      <Text style={styles.barLabel} numberOfLines={1}>
        {bucket.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    fontSize: 13,
    color: Colors.textTertiary,
    paddingVertical: 12,
    textAlign: "center",
  },
  totalLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  barsRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 4,
    height: 180,
    marginBottom: 12,
  },
  barCol: {
    flex: 1,
    minWidth: 12,
    alignItems: "center",
    height: "100%",
    justifyContent: "flex-end",
  },
  barColWide: {
    minWidth: 80,
  },
  barTrack: {
    width: "100%",
    flex: 1,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: 4,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  barStack: {
    width: "100%",
    overflow: "hidden",
    flexDirection: "column-reverse",
  },
  barLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
  },
  legend: {
    flexDirection: "column",
    gap: 6,
    paddingTop: 16,
    marginTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.borderLight,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: {
    flex: 1,
    fontSize: 12,
    color: Colors.text,
  },
  legendValue: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
});
