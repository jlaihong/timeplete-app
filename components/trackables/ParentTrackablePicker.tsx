import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import { exceedsMaxDepth } from "../../lib/trackableTree";

interface Props {
  /** The trackable being edited; `undefined` while creating one. */
  trackableId?: Id<"trackables">;
  trackables: Doc<"trackables">[];
  value: Id<"trackables"> | null;
  onChange: (parentId: Id<"trackables"> | null) => void;
}

/**
 * Chooses the trackable another one sits under ("Family" under
 * "Social"). Everything that counts toward a trackable also counts
 * toward its parent, once. A trackable cannot go under itself or under
 * anything below it.
 */
export function ParentTrackablePicker({
  trackableId,
  trackables,
  value,
  onChange,
}: Props) {
  const options = useMemo(() => {
    const byId = new Map(trackables.map((t) => [t._id as string, t]));
    // Levels hanging below the trackable being edited: they move with it.
    const ownDepth = trackableId
      ? (byId.get(trackableId)?.ancestorIds?.length ?? 0)
      : 0;
    const levelsBelow = trackableId
      ? trackables.reduce(
          (max, t) =>
            (t.ancestorIds ?? []).includes(trackableId)
              ? Math.max(max, (t.ancestorIds?.length ?? 0) - ownDepth)
              : max,
          0,
        )
      : 0;
    return trackables
      .filter(
        (t) =>
          t._id === value ||
          (!t.archived &&
            t._id !== trackableId &&
            !(trackableId && (t.ancestorIds ?? []).includes(trackableId)) &&
            // The tree is three levels deep at most.
            !exceedsMaxDepth(t.ancestorIds?.length ?? 0, levelsBelow)),
      )
      .map((t) => ({
        id: t._id,
        colour: t.colour,
        path: [...(t.ancestorIds ?? []), t._id]
          .map((id) => byId.get(id)?.name ?? "")
          .join(" / "),
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }, [trackables, trackableId, value]);

  return (
    <View>
      <Text style={styles.label}>Sits under</Text>
      <View style={styles.chips}>
        <Chip label="Nothing (top level)" selected={value === null} onPress={() => onChange(null)} />
        {options.map((o) => (
          <Chip
            key={o.id}
            label={o.path}
            colour={o.colour}
            selected={value === o.id}
            onPress={() => onChange(o.id)}
          />
        ))}
      </View>
      <Text style={styles.help}>
        Time and completed tasks that count toward this trackable also count
        toward the one it sits under.
      </Text>
    </View>
  );
}

function Chip({
  label,
  colour,
  selected,
  onPress,
}: {
  label: string;
  colour?: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {colour ? <View style={[styles.dot, { backgroundColor: colour }]} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: FontSize.caption,
    color: Colors.textSecondary,
    marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  chipText: { fontSize: FontSize.body, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.text },
  dot: { width: 10, height: 10, borderRadius: 5 },
  help: {
    marginTop: 8,
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
  },
});
