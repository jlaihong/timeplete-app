import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Colors } from "../../../constants/colors";
import { FontSize, Radius } from "../../../theme/tokens";
import { useAuth } from "../../../hooks/useAuth";
import { formatMeasure } from "../../../lib/trackableShape";
import { stopTrackableDrag } from "./dragSafe";

interface SubTrackablePillsProps {
  trackableId: Id<"trackables">;
  today: string;
  /** A sub-trackable's pill was pressed. */
  onPick: (trackableId: Id<"trackables">) => void;
}

/**
 * A trackable's direct sub-trackables, on its card: a thin bar split by
 * their share of this period, and a pill for each with its value. Only
 * one level is shown; pressing a pill moves the card to that
 * sub-trackable, where its own sub-trackables appear the same way.
 *
 * Values are in the parent's measure and period (`trackableProgress
 * .breakdown`), so they compare with the number above them. The bar is
 * left out when shares do not add up (days active, a logged number).
 */
export function SubTrackablePills({
  trackableId,
  today,
  onPick,
}: SubTrackablePillsProps) {
  const { profileReady } = useAuth();
  const data = useQuery(
    api.trackableProgress.breakdown,
    profileReady ? { id: trackableId, today } : "skip",
  );
  if (!data || data.parts.length === 0) return null;

  const sum = data.parts.reduce((s, p) => s + p.value, 0);
  return (
    <View style={styles.wrap}>
      {data.additive && sum > 0 ? (
        <View style={styles.bar} accessibilityElementsHidden>
          {data.parts
            .filter((p) => p.value > 0)
            .map((p) => (
              <View
                key={p._id}
                style={[
                  styles.segment,
                  { flexGrow: p.value, backgroundColor: p.colour },
                ]}
              />
            ))}
        </View>
      ) : null}
      <View style={styles.pills}>
        {data.parts.map((p) => (
          <Pressable
            key={p._id}
            onPress={() => onPick(p._id)}
            onPointerDown={stopTrackableDrag as never}
            accessibilityRole="button"
            accessibilityLabel={`${p.name}: ${formatMeasure(data.measure, p.value)}. Show ${p.name}`}
            style={(state) => [
              styles.pill,
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.pillHover,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: p.colour }]} />
            <Text style={styles.name} numberOfLines={1}>
              {p.name}
            </Text>
            <Text style={styles.value}>
              {formatMeasure(data.measure, p.value)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: "stretch" },
  bar: { flexDirection: "row", gap: 2, height: 6 },
  segment: { height: 6, borderRadius: 3, flexBasis: 0 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  pillHover: { backgroundColor: Colors.surfaceContainerHigh },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { fontSize: FontSize.caption, color: Colors.text, flexShrink: 1 },
  value: { fontSize: FontSize.caption, color: Colors.textSecondary },
});
