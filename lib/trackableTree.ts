/**
 * Lays trackables out as a tree for display: the top-level ones, each
 * with everything below it. Lists show one card per top-level trackable
 * and the rest as rows inside that card, instead of a card for every
 * sub-trackable.
 *
 * "Top-level" is relative to what is being shown: a sub-trackable whose
 * parents are not in the list (archived, or hidden from Home) leads its
 * own card rather than disappearing.
 */

/**
 * How many levels a tree of trackables can have, the top one included:
 * "Work" → "Amazon" → "MSA project" is the deepest allowed.
 */
export const MAX_TRACKABLE_DEPTH = 3;

/**
 * Would putting a trackable under `parent` make the tree too deep?
 * `levelsBelow` is how many levels the moved trackable has under it
 * (0 when it has no sub-trackables).
 */
export function exceedsMaxDepth(
  parentAncestorCount: number,
  levelsBelow: number,
): boolean {
  // parent's level + the moved trackable + what hangs below it
  return parentAncestorCount + 1 + 1 + levelsBelow > MAX_TRACKABLE_DEPTH;
}

export interface TreeNode {
  _id: string;
  orderIndex: number;
}

export interface TrackableGroup<T> {
  root: T;
  /** Everything below the root that is in the list, parents before children. */
  descendants: { item: T; depth: number }[];
}

export function groupTrackablesByTree<T extends TreeNode>(
  items: readonly T[],
  /** Path from the root down to the parent, for each trackable. */
  ancestorsOf: (id: string) => readonly string[],
): TrackableGroup<T>[] {
  const shown = new Set(items.map((i) => i._id));
  /** Nearest ancestor that is in the list, or `null` for a top-level one. */
  const shownParent = new Map<string, string | null>();
  for (const item of items) {
    const path = ancestorsOf(item._id);
    let parent: string | null = null;
    for (let i = path.length - 1; i >= 0; i--) {
      if (shown.has(path[i]) && path[i] !== item._id) {
        parent = path[i];
        break;
      }
    }
    shownParent.set(item._id, parent);
  }

  const childrenOf = new Map<string, T[]>();
  for (const item of items) {
    const parent = shownParent.get(item._id);
    if (!parent) continue;
    const list = childrenOf.get(parent) ?? [];
    list.push(item);
    childrenOf.set(parent, list);
  }
  const byOrder = (a: T, b: T) => a.orderIndex - b.orderIndex;

  const collect = (
    id: string,
    depth: number,
    out: { item: T; depth: number }[],
  ) => {
    for (const child of [...(childrenOf.get(id) ?? [])].sort(byOrder)) {
      out.push({ item: child, depth });
      collect(child._id, depth + 1, out);
    }
  };

  return items
    .filter((item) => shownParent.get(item._id) === null)
    .map((root) => {
      const descendants: { item: T; depth: number }[] = [];
      collect(root._id, 0, descendants);
      return { root, descendants };
    });
}
