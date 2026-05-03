import type { GroupByMode, GroupedBucket, GroupingLookups, TimeWindowLike } from "../grouping";
import { groupTimeWindowsWithBuckets } from "../grouping";

const PAD_RAD = 0.008;

export interface PartitionArc {
  key: string;
  depth: number;
  mode: GroupByMode;
  label: string;
  seconds: number;
  colour?: string;
  windows: TimeWindowLike[];
  a0: number;
  a1: number;
  rInner: number;
  rOuter: number;
}

function subdivideAngles(
  angleStart: number,
  angleEnd: number,
  buckets: GroupedBucket[]
): { a0: number; a1: number }[] {
  if (buckets.length === 0) return [];
  const spanTotal = angleEnd - angleStart;
  const padTotal = PAD_RAD * buckets.length;
  const usable = Math.max(0, spanTotal - padTotal);
  const sumSec = buckets.reduce((s, b) => s + b.totalSeconds, 0);

  let acc = angleStart;
  if (sumSec <= 0) {
    const w = buckets.length > 0 ? usable / buckets.length : 0;
    return buckets.map(() => {
      const a0 = acc;
      acc += w + PAD_RAD;
      return { a0, a1: a0 + w };
    });
  }

  return buckets.map((b) => {
    const w = (b.totalSeconds / sumSec) * usable;
    const a0 = acc;
    acc += w + PAD_RAD;
    return { a0, a1: a0 + w };
  });
}

function radiusBand(
  depth: number,
  levelsCount: number,
  rOuterMax: number,
  hubR: number,
  ringGap: number
): { rOuter: number; rInner: number } {
  const L = levelsCount;
  const gaps = Math.max(0, L - 1) * ringGap;
  const radialUsable = rOuterMax - hubR - gaps;
  const band = L > 0 ? radialUsable / L : 0;
  const rOuter = rOuterMax - depth * (band + ringGap);
  const rInner = rOuter - band;
  return { rOuter, rInner };
}

/**
 * Multi-ring partition: outer rings = earlier grouping levels; each wedge
 * recursively subdivides angular range for deeper levels (Productivity-One style).
 */
export function buildPartitionArcs(
  windows: TimeWindowLike[],
  groupingLevels: GroupByMode[],
  lookups: GroupingLookups,
  geometry: { rOuterMax: number; hubR: number; ringGap: number }
): PartitionArc[] {
  const { rOuterMax, hubR, ringGap } = geometry;
  const arcs: PartitionArc[] = [];
  const L = groupingLevels.length;

  function recur(
    sliceWindows: TimeWindowLike[],
    depth: number,
    a0: number,
    a1: number,
    pathKey: string
  ) {
    if (depth >= L || sliceWindows.length === 0) return;
    const mode = groupingLevels[depth]!;
    const buckets = groupTimeWindowsWithBuckets(sliceWindows, mode, lookups);
    if (buckets.length === 0) return;

    const angles = subdivideAngles(a0, a1, buckets);
    const { rOuter, rInner } = radiusBand(depth, L, rOuterMax, hubR, ringGap);

    buckets.forEach((b, i) => {
      const { a0: ta0, a1: ta1 } = angles[i]!;
      const key = `${pathKey}@${depth}:${b.key}`;
      arcs.push({
        key,
        depth,
        mode,
        label: b.label,
        seconds: b.totalSeconds,
        colour: b.colour,
        windows: b.windows,
        a0: ta0,
        a1: ta1,
        rInner,
        rOuter,
      });
      recur(b.windows, depth + 1, ta0, ta1, key);
    });
  }

  recur(windows, 0, 0, Math.PI * 2, "root");
  return arcs;
}
