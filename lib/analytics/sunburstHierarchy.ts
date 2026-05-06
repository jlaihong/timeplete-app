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
 * Full nested hierarchy for the ordered grouping sequence (recursive buckets).
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
