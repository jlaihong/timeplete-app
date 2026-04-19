import React, { useMemo } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { Colors } from "../../../constants/colors";
import {
  formatSecondsAsHM,
  getDaysInRange,
  parseYYYYMMDD,
} from "../../../lib/dates";
import { SectionCard } from "../SectionCard";
import { useAnalyticsDataset, TimeWindowLite } from "../useAnalyticsDataset";
import { useAnalyticsState } from "../AnalyticsState";

/* ──────────────────────────────────────────────────────────────────── *
 * Time Spend (P1 spelling) — productivity-one's third column.
 *
 * P1 renders:
 *  - Daily/Weekly/Monthly: stacked bars by *time-of-day* per bucket
 *    (one bucket per day in the window), coloured by trackable.
 *  - Yearly: stacked bars per month, y-axis = hours.
 *
 * We render a stacked-bar version that aggregates per bucket and
 * stacks coloured segments per trackable. This preserves all the
 * truth claims P1 makes (totals per bucket match Time Breakdown),
 * just without the time-of-day y-axis.
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

function dailyBucketLabel(day: string, tab: string): string {
  const d = parseYYYYMMDD(day);
  if (tab === "WEEKLY") {
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }
  if (tab === "MONTHLY") {
    return String(d.getDate());
  }
  // DAILY → only one bucket; show full date as label.
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function TimeSpendSection() {
  const { selectedTab, windowStart, windowEnd } = useAnalyticsState();
  const dataset = useAnalyticsDataset();

  const isYearly = selectedTab === "YEARLY";

  const buckets = useMemo<BarBucket[]>(() => {
    const ids: { id: string; label: string }[] = isYearly
      ? makeYearMonthBuckets(parseInt(windowStart.slice(0, 4)))
      : getDaysInRange(windowStart, windowEnd).map((d) => ({
          id: d,
          label: dailyBucketLabel(d, selectedTab),
        }));

    // Per-bucket map: trackableId|null → seconds
    const map = new Map<string, Map<string, number>>();
    for (const id of ids.map((b) => b.id)) {
      map.set(id, new Map());
    }

    for (const w of dataset.timeWindows) {
      const bucketId = bucketIdForWindow(w, isYearly);
      const inner = map.get(bucketId);
      if (!inner) continue;
      const tid = dataset.resolveTrackableId(w) ?? "__untracked__";
      inner.set(tid, (inner.get(tid) ?? 0) + w.durationSeconds);
    }

    return ids.map(({ id, label }) => {
      const inner = map.get(id) ?? new Map();
      const segments: BarSegment[] = [];
      let total = 0;
      for (const [tid, seconds] of inner.entries()) {
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
  }, [dataset, isYearly, selectedTab, windowStart, windowEnd]);

  const maxBucketSeconds = useMemo(
    () => Math.max(0, ...buckets.map((b) => b.totalSeconds)),
    [buckets]
  );

  // Legend: union of trackables that contributed in this window,
  // ordered by total seconds desc.
  const legend = useMemo(() => {
    const totals = new Map<string, number>();
    for (const b of buckets) {
      for (const seg of b.segments) {
        if (!seg.trackableId) continue;
        totals.set(
          seg.trackableId,
          (totals.get(seg.trackableId) ?? 0) + seg.seconds
        );
      }
    }
    return Array.from(totals.entries())
      .sort(([, a], [, b]) => b - a)
      .map(([tid, seconds]) => ({
        trackableId: tid,
        seconds,
        trackable: dataset.trackables[tid],
      }))
      .filter((x) => x.trackable);
  }, [buckets, dataset.trackables]);

  const showHorizontalScroll =
    selectedTab === "MONTHLY" && buckets.length > 14;

  const Body = (
    <View style={styles.barsRow}>
      {buckets.map((b) => (
        <BarColumn
          key={b.id}
          bucket={b}
          maxSeconds={maxBucketSeconds}
          isWide={selectedTab === "DAILY"}
        />
      ))}
    </View>
  );

  return (
    <SectionCard title="Time Spend">
      {dataset.isLoading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : maxBucketSeconds === 0 ? (
        <Text style={styles.empty}>No time recorded in this period.</Text>
      ) : (
        <>
          <Text style={styles.totalLabel}>
            Total: {formatSecondsAsHM(dataset.totalSeconds)}
          </Text>
          {showHorizontalScroll ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {Body}
            </ScrollView>
          ) : (
            Body
          )}
          {legend.length > 0 && (
            <View style={styles.legend}>
              {legend.map(({ trackableId, trackable, seconds }) => (
                <View key={trackableId} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: trackable!.colour },
                    ]}
                  />
                  <Text style={styles.legendLabel} numberOfLines={1}>
                    {trackable!.name}
                  </Text>
                  <Text style={styles.legendValue}>
                    {formatSecondsAsHM(seconds)}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </SectionCard>
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
    marginBottom: 8,
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
    gap: 4,
    paddingTop: 4,
    borderTopWidth: 1,
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
