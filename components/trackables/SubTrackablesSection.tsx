import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { useAuth } from "../../hooks/useAuth";
import { useTrackableTags } from "../../hooks/useTrackableTags";
import { todayYYYYMMDD } from "../../lib/dates";
import { PERIODS, formatMeasure } from "../../lib/trackableShape";
import { exceedsMaxDepth } from "../../lib/trackableTree";
import { TrackableFormDialog } from "./TrackableForm";

interface Props {
  trackableId: Id<"trackables">;
  /** Open another trackable's page. */
  onOpenTrackable: (id: Id<"trackables">) => void;
}

/**
 * "Made up of", on a trackable's page: each direct sub-trackable with its
 * value and share of this period, what was allocated to the trackable
 * itself, and a way to add a sub-trackable. A row opens that
 * sub-trackable's page.
 */
export function SubTrackablesSection({ trackableId, onOpenTrackable }: Props) {
  const { profileReady } = useAuth();
  const tags = useTrackableTags();
  const [adding, setAdding] = useState(false);
  const data = useQuery(
    api.trackableProgress.breakdown,
    profileReady ? { id: trackableId, today: todayYYYYMMDD() } : "skip",
  );
  const self = tags.byId.get(trackableId);
  // The tree is three levels deep at most.
  const canAdd =
    !!self && !exceedsMaxDepth(self.ancestorIds?.length ?? 0, 0);
  if (!data || !self) return null;
  if (data.parts.length === 0 && !canAdd) return null;

  const fmt = (n: number) => formatMeasure(data.measure, n);
  const share = (value: number) =>
    data.additive && data.total > 0
      ? Math.min(1, value / data.total)
      : null;
  const periodNoun = PERIODS.find((p) => p.key === data.period.kind)!.noun;

  return (
    <View style={styles.section}>
      {data.parts.length > 0 ? (
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Made up of</Text>
          <Text style={styles.period}>
            {periodNoun.toLowerCase()} · {fmt(data.total)}
          </Text>
        </View>
      ) : null}

      {data.parts.map((part) => (
        <Row
          key={part._id}
          colour={part.colour}
          name={part.name}
          value={fmt(part.value)}
          share={share(part.value)}
          onPress={() => onOpenTrackable(part._id)}
        />
      ))}
      {data.direct !== null && data.direct > 0 ? (
        <Row
          colour={Colors.outlineVariant}
          name={`${self.name} directly`}
          value={fmt(data.direct)}
          share={share(data.direct)}
          muted
        />
      ) : null}
      {data.overlap !== null && data.overlap > 0 ? (
        <Text style={styles.note}>
          {fmt(data.overlap)} counts toward more than one of these, and once
          toward {self.name}.
        </Text>
      ) : null}

      {canAdd ? (
        <Pressable
          onPress={() => setAdding(true)}
          accessibilityRole="button"
          style={styles.add}
        >
          <Ionicons name="add" size={16} color={Colors.primary} />
          <Text style={styles.addText}>Add a sub-trackable</Text>
        </Pressable>
      ) : null}

      {adding ? (
        <TrackableFormDialog
          defaultParentId={trackableId}
          onClose={() => setAdding(false)}
        />
      ) : null}
    </View>
  );
}

function Row({
  colour,
  name,
  value,
  share,
  muted = false,
  onPress,
}: {
  colour: string;
  name: string;
  value: string;
  /** 0..1 of the parent's total, or `null` when shares do not apply. */
  share: number | null;
  muted?: boolean;
  onPress?: () => void;
}) {
  const body = (
    <>
      <View style={[styles.dot, { backgroundColor: colour }]} />
      <Text style={[styles.name, muted && styles.muted]} numberOfLines={1}>
        {name}
      </Text>
      {share !== null ? (
        <View style={styles.track}>
          <View
            style={[
              styles.fill,
              { width: `${Math.round(share * 100)}%`, backgroundColor: colour },
            ]}
          />
        </View>
      ) : (
        <View style={styles.spacer} />
      )}
      <Text style={[styles.value, muted && styles.muted]}>{value}</Text>
      <View style={styles.chevron}>
        {onPress ? (
          <Ionicons
            name="chevron-forward"
            size={14}
            color={Colors.textTertiary}
          />
        ) : null}
      </View>
    </>
  );
  return onPress ? (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name}: ${value}`}
      style={(state) => [
        styles.row,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.rowHover,
      ]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={styles.row}>{body}</View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 2 },
  headingRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  heading: { fontSize: FontSize.bodyLarge, fontWeight: "600", color: Colors.text },
  period: { fontSize: FontSize.caption, color: Colors.textTertiary },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: Radius.sm,
  },
  rowHover: { backgroundColor: Colors.surfaceContainerHigh },
  dot: { width: 9, height: 9, borderRadius: 5 },
  name: { width: 140, fontSize: FontSize.body, color: Colors.text },
  muted: { color: Colors.textSecondary },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainerHighest,
    overflow: "hidden",
  },
  fill: { height: 6, borderRadius: 3 },
  spacer: { flex: 1 },
  value: {
    minWidth: 44,
    textAlign: "right",
    fontSize: FontSize.body,
    color: Colors.text,
  },
  chevron: { width: 14 },
  note: {
    paddingHorizontal: 6,
    paddingTop: 4,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
  add: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 6,
  },
  addText: { fontSize: FontSize.body, color: Colors.primary },
});
