import type { GroupByMode, GroupedBucket, GroupingLookups, TimeWindowLike } from "../grouping";
import { groupTimeWindowsWithBuckets } from "../grouping";

const PAD_RAD = 0.004;

/**
 * Bucket colours may be `undefined`, `null`, or `""` from Convex/UI — treat those as
 * “no colour” so wedges inherit the parent segment colour (productivity-one).
 */
function resolveArcColour(
  bucketColour: string | undefined | null,
  inheritedColour: string | undefined | null
): string | undefined {
  const fromBucket = bucketColour?.trim();
  if (fromBucket) return fromBucket;
  const fromParent = inheritedColour?.trim();
  if (fromParent) return fromParent;
  return undefined;
}

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
  // Innermost ring = depth 0 (first grouping); each outer ring = next level.
  const rInner = hubR + depth * (band + ringGap);
  const rOuter = rInner + band;
  return { rOuter, rInner };
}

/**
 * Multi-ring partition: inner ring = first grouping level; each outer ring breaks
 * down the parent wedge by the next level (Productivity-One style).
 *
 * Segment colours: explicit colours from buckets (when present and non-blank) win;
 * otherwise the wedge inherits from its parent — lists/tasks/tags/dates without a colour
 * all chain upward until the chart fallback palette applies at paint time.
 *
 * With `inheritParentBandColours: false` (zoomed chart), only each bucket’s own colour
 * is used; inner rings no longer inherit the parent band’s resolved colour so neutral
 * segments use the chart default (calendar gray) instead of “tinting” the whole subtree.
 */
export function buildPartitionArcs(
  windows: TimeWindowLike[],
  groupingLevels: GroupByMode[],
  lookups: GroupingLookups,
  geometry: {
    rOuterMax: number;
    hubR: number;
    ringGap: number;
    /**
     * When false, each ring uses only intrinsic bucket colours (list/task/trackable
     * from lookups); inner wedges do not inherit the parent wedge’s resolved paint
     * colour. Matches Productivity-One zoom focus: neutral segments stay default/gray.
     */
    inheritParentBandColours?: boolean;
  }
): PartitionArc[] {
  const { rOuterMax, hubR, ringGap, inheritParentBandColours = true } = geometry;
  const arcs: PartitionArc[] = [];
  const L = groupingLevels.length;

  function recur(
    sliceWindows: TimeWindowLike[],
    depth: number,
    a0: number,
    a1: number,
    pathKey: string,
    /** Effective paint colour from the containing wedge (for inheritance). */
    inheritedColour?: string
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
      const effectiveColour = resolveArcColour(b.colour, inheritedColour);
      arcs.push({
        key,
        depth,
        mode,
        label: b.label,
        seconds: b.totalSeconds,
        colour: effectiveColour,
        windows: b.windows,
        a0: ta0,
        a1: ta1,
        rInner,
        rOuter,
      });
      const passToChildren =
        inheritParentBandColours ? effectiveColour : undefined;
      recur(b.windows, depth + 1, ta0, ta1, key, passToChildren);
    });
  }

  recur(windows, 0, 0, Math.PI * 2, "root", undefined);
  return arcs;
}
