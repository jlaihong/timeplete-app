/**
 * Pages nest under other pages ("Wesley" under "Family"). Each page
 * stores only its parent; these helpers turn the full list of pages into
 * the tree that is shown.
 *
 * A page whose parent is not in the list (deleted a moment ago) is
 * treated as top-level rather than disappearing.
 */

/**
 * How many levels a tree of pages can have, the top one included.
 */
export const MAX_PAGE_DEPTH = 5;

/**
 * Would a page with `levelsBelow` levels under it (0: no sub-pages) fit
 * under a parent sitting at `parentLevel` (1: a top-level page)?
 */
export function pageFitsUnder(parentLevel: number, levelsBelow: number): boolean {
  return parentLevel + 1 + levelsBelow <= MAX_PAGE_DEPTH;
}

/** Guard against a runaway chain of parents in data that has a loop. */
const WALK_LIMIT = 50;

export interface PageNode {
  _id: string;
  name: string;
  parentId?: string;
  orderIndex?: number;
}

export interface PageRow<T> {
  page: T;
  /** 0 for a top-level page. */
  depth: number;
  hasChildren: boolean;
}

/**
 * Order of pages that share a parent: the ones the owner has arranged
 * by hand first, in that order, then the rest by name.
 */
export function comparePages(a: PageNode, b: PageNode): number {
  if (a.orderIndex !== undefined && b.orderIndex !== undefined) {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
  } else if (a.orderIndex !== undefined) {
    return -1;
  } else if (b.orderIndex !== undefined) {
    return 1;
  }
  return a.name.localeCompare(b.name);
}

const byName = comparePages;

/** Pages grouped by the parent they sit under; `""` holds the top level. */
function childrenByParent<T extends PageNode>(
  pages: readonly T[],
): Map<string, T[]> {
  const ids = new Set(pages.map((p) => p._id));
  const out = new Map<string, T[]>();
  for (const page of pages) {
    const key = page.parentId && ids.has(page.parentId) ? page.parentId : "";
    const list = out.get(key);
    if (list) list.push(page);
    else out.set(key, [page]);
  }
  for (const list of out.values()) list.sort(byName);
  return out;
}

/**
 * Every page as a row, parents before their children, siblings in
 * `comparePages` order.
 * Pages under a collapsed page are left out.
 */
export function pageTreeRows<T extends PageNode>(
  pages: readonly T[],
  collapsed: ReadonlySet<string> = new Set(),
): PageRow<T>[] {
  const children = childrenByParent(pages);
  const rows: PageRow<T>[] = [];
  const seen = new Set<string>();
  const walk = (parentKey: string, depth: number) => {
    for (const page of children.get(parentKey) ?? []) {
      if (seen.has(page._id)) continue;
      seen.add(page._id);
      const hasChildren = (children.get(page._id)?.length ?? 0) > 0;
      rows.push({ page, depth, hasChildren });
      if (hasChildren && !collapsed.has(page._id)) walk(page._id, depth + 1);
    }
  };
  walk("", 0);
  // Pages caught in a loop of parents (should not happen) still show.
  if (collapsed.size === 0 && seen.size < pages.length) {
    for (const page of [...pages].sort(byName)) {
      if (!seen.has(page._id)) {
        rows.push({ page, depth: 0, hasChildren: false });
      }
    }
  }
  return rows;
}

/** The pages above `id`, from the top level down to its parent. */
export function pageAncestors<T extends PageNode>(
  byId: ReadonlyMap<string, T>,
  id: string,
): T[] {
  const out: T[] = [];
  const seen = new Set([id]);
  let parentId = byId.get(id)?.parentId;
  while (parentId && !seen.has(parentId) && out.length < WALK_LIMIT) {
    const parent = byId.get(parentId);
    if (!parent) break;
    seen.add(parentId);
    out.unshift(parent);
    parentId = parent.parentId;
  }
  return out;
}

/** The pages directly under `id`, in order. */
export function pageChildren<T extends PageNode>(
  pages: readonly T[],
  id: string,
): T[] {
  return pages.filter((p) => p.parentId === id).sort(byName);
}

/** Ids of everything below `id`, at any depth. */
export function pageDescendantIds(
  pages: readonly PageNode[],
  id: string,
): Set<string> {
  const children = childrenByParent(pages);
  const out = new Set<string>();
  const walk = (parentId: string) => {
    for (const child of children.get(parentId) ?? []) {
      if (child._id === id || out.has(child._id)) continue;
      out.add(child._id);
      walk(child._id);
    }
  };
  walk(id);
  return out;
}

/**
 * The pages `movedId` may be put under: not itself, nothing below it,
 * and nowhere that would make the tree deeper than `MAX_PAGE_DEPTH`.
 */
export function pageParentOptions<T extends PageNode>(
  pages: readonly T[],
  movedId: string,
): Set<string> {
  const byId = new Map(pages.map((p) => [p._id, p]));
  const children = childrenByParent(pages);
  const below = pageDescendantIds(pages, movedId);
  const height = (id: string, guard: number): number =>
    guard > WALK_LIMIT
      ? 0
      : (children.get(id) ?? []).reduce(
          (max, child) => Math.max(max, 1 + height(child._id, guard + 1)),
          0,
        );
  const levelsBelow = height(movedId, 0);
  const out = new Set<string>();
  for (const page of pages) {
    if (page._id === movedId || below.has(page._id)) continue;
    const level = pageAncestors(byId, page._id).length + 1;
    if (pageFitsUnder(level, levelsBelow)) out.add(page._id);
  }
  return out;
}

/**
 * Where a page lands among its new siblings. `siblings` are the other
 * pages under the destination parent (the moved page left out). It goes
 * before `beforeId`, or after `afterId`, or at the end. Returns every
 * sibling and the moved page with the `orderIndex` each should have.
 */
export function placePage<T extends PageNode>(
  siblings: readonly T[],
  movedId: string,
  where: { beforeId?: string | null; afterId?: string | null },
): { _id: string; orderIndex: number }[] {
  const ids = [...siblings]
    .filter((p) => p._id !== movedId)
    .sort(comparePages)
    .map((p) => p._id);
  let at = ids.length;
  if (where.beforeId && ids.includes(where.beforeId)) {
    at = ids.indexOf(where.beforeId);
  } else if (where.afterId && ids.includes(where.afterId)) {
    at = ids.indexOf(where.afterId) + 1;
  }
  ids.splice(at, 0, movedId);
  return ids.map((_id, orderIndex) => ({ _id, orderIndex }));
}

/** One visible row of the tree while a page is being dragged. */
export interface DragRow {
  id: string;
  depth: number;
  /** `null` for a row drawn at the top level. */
  parentId: string | null;
}

/**
 * Where a dragged page would land. `rows` are the visible rows in order,
 * without the pages under the dragged one (they travel with it). The
 * page is dragged over the row `overId`; `depthChange` is how many levels
 * it has been pulled right (+) or left (−) of where it started, and
 * `levelsBelow` how many levels of pages hang under it.
 *
 * The level is kept between what the rows around the landing spot allow
 * (at most one deeper than the row above, no shallower than the row
 * below) and what `MAX_PAGE_DEPTH` allows. `null`: it cannot land there.
 */
export function projectPageDrop(
  rows: readonly DragRow[],
  activeId: string,
  overId: string,
  depthChange: number,
  levelsBelow: number,
): {
  depth: number;
  parentId: string | null;
  place: { beforeId?: string; afterId?: string };
} | null {
  const from = rows.findIndex((r) => r.id === activeId);
  const to = rows.findIndex((r) => r.id === overId);
  if (from < 0 || to < 0) return null;
  const moved = [...rows];
  moved.splice(to, 0, ...moved.splice(from, 1));
  const prev = moved[to - 1];
  const next = moved[to + 1];

  const max = Math.min(
    prev ? prev.depth + 1 : 0,
    MAX_PAGE_DEPTH - 1 - levelsBelow,
  );
  const min = next ? next.depth : 0;
  if (min > max) return null;
  const depth = Math.max(min, Math.min(max, rows[from].depth + depthChange));

  let parentId: string | null = null;
  if (depth > 0 && prev) {
    if (depth === prev.depth) parentId = prev.parentId;
    else if (depth > prev.depth) parentId = prev.id;
    else {
      for (let i = to - 1; i >= 0; i--) {
        if (moved[i].depth === depth) {
          parentId = moved[i].parentId;
          break;
        }
      }
    }
  }

  // Its neighbour at the same level: the one above, else the one below.
  for (let i = to - 1; i >= 0 && moved[i].depth >= depth; i--) {
    if (moved[i].depth === depth) {
      return { depth, parentId, place: { afterId: moved[i].id } };
    }
  }
  for (let i = to + 1; i < moved.length && moved[i].depth >= depth; i++) {
    if (moved[i].depth === depth) {
      return { depth, parentId, place: { beforeId: moved[i].id } };
    }
  }
  return { depth, parentId, place: {} };
}

/** How many levels of pages hang under `id` (0: none). */
export function pageLevelsBelow(pages: readonly PageNode[], id: string): number {
  const children = childrenByParent(pages);
  const height = (at: string, guard: number): number =>
    guard > WALK_LIMIT
      ? 0
      : (children.get(at) ?? []).reduce(
          (max, child) => Math.max(max, 1 + height(child._id, guard + 1)),
          0,
        );
  return height(id, 0);
}
