import type { GroupByMode, GroupingLookups, TimeWindowLike } from "../grouping";
import { groupTimeWindowsWithBuckets } from "../grouping";

/** Nested sunburst tree — mirrors `groupingLevels` order (depth-first). */
export interface SunburstHierarchyNode {
  key: string;
  label: string;
  colour?: string;
  totalSeconds: number;
  children: SunburstHierarchyNode[];
}

/**
 * Buckets for one ring at drill depth `depth`, using `groupingLevels[depth]`.
 * This is what the interactive chart consumes while drilling (incremental).
 */
export function sunburstRingBuckets(
  windows: TimeWindowLike[],
  depth: number,
  groupingLevels: GroupByMode[],
  lookups: GroupingLookups
) {
  if (depth < 0 || depth >= groupingLevels.length) return [];
  const mode = groupingLevels[depth];
  if (!mode) return [];
  return groupTimeWindowsWithBuckets(windows, mode, lookups);
}

function buildLevel(
  windows: TimeWindowLike[],
  levels: GroupByMode[],
  lookups: GroupingLookups
): SunburstHierarchyNode[] {
  if (levels.length === 0) return [];
  const buckets = groupTimeWindowsWithBuckets(windows, levels[0]!, lookups);
  const tail = levels.slice(1);
  return buckets.map((b) => ({
    key: b.key,
    label: b.label,
    colour: b.colour,
    totalSeconds: b.totalSeconds,
    children: tail.length === 0 ? [] : buildLevel(b.windows, tail, lookups),
  }));
}

/**
 * Full nested hierarchy for the ordered grouping sequence.
 * Materializes every branch — typical analytics sizes only.
 */
export function buildSunburstHierarchy(
  windows: TimeWindowLike[],
  groupingLevels: GroupByMode[],
  lookups: GroupingLookups
): SunburstHierarchyNode {
  const totalSeconds = windows.reduce((s, w) => s + w.durationSeconds, 0);
  return {
    key: "root",
    label: "Total",
    totalSeconds,
    children: buildLevel(windows, groupingLevels, lookups),
  };
}
