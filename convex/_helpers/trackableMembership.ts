/**
 * Which trackables does a task or a time window count toward?
 *
 * This is the one place that answers it. The answer is a SET:
 *
 *   allocated  the "Tracks to" field (`trackableIds`): trackables picked
 *              for this item by hand;
 *   rules      rules on a trackable that match the item: "tasks on this
 *              list" (`listTrackableLinks`) and "mentions this page"
 *              (`trackableRules`, e.g. "@Wesley" counts toward "Family");
 *   task       a window logged on a task inherits everything its task
 *              counts toward;
 *   tree       every ancestor of any of the above ("Family" → "Social").
 *
 * Because it is a set, an event allocated to Family and Friends counts
 * toward their parent "Social" once, not twice.
 *
 * The resolved set is stamped on the row (`attributedTrackableIds`) by
 * `_helpers/trackableLifetime`, which is also what makes totals movable:
 * the stamp records who was credited, so a later change to allocations,
 * rules or the tree is applied as an exact difference.
 *
 * Adding a rule kind: resolve it in `taskTags` / `windowTags` and make
 * whatever edits the rule schedule `internal.trackableResync.run`.
 */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { mentionedPageIds } from "../../lib/mentions";

type Ctx = QueryCtx | MutationCtx;

/** Per-mutation memo so resolving many rows reads each trackable once. */
export type MembershipCache = {
  trackables: Map<string, Doc<"trackables"> | null>;
  /** userId → listId → trackables with a rule on that list. */
  listRules: Map<string, Map<string, Id<"trackables">[]>>;
  /** userId → pageId → trackables with a "mentions this page" rule. */
  pageRules: Map<string, Map<string, Id<"trackables">[]>>;
};

export function newMembershipCache(): MembershipCache {
  return { trackables: new Map(), listRules: new Map(), pageRules: new Map() };
}

async function loadTrackable(
  ctx: Ctx,
  cache: MembershipCache,
  rawId: string,
): Promise<Doc<"trackables"> | null> {
  if (cache.trackables.has(rawId)) return cache.trackables.get(rawId) ?? null;
  const id = ctx.db.normalizeId("trackables", rawId);
  const doc = id ? await ctx.db.get(id) : null;
  cache.trackables.set(rawId, doc);
  return doc;
}

/** Trackables with an "any task on this list" rule for `listId`. */
export async function listRuleTrackableIds(
  ctx: Ctx,
  cache: MembershipCache,
  userId: Id<"users">,
  listId: Id<"lists"> | undefined | null,
): Promise<Id<"trackables">[]> {
  if (!listId) return [];
  let byList = cache.listRules.get(userId);
  if (!byList) {
    byList = new Map();
    const links = await ctx.db
      .query("listTrackableLinks")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    for (const link of links) {
      const ids = byList.get(link.listId) ?? [];
      ids.push(link.trackableId);
      byList.set(link.listId, ids);
    }
    cache.listRules.set(userId, byList);
  }
  return byList.get(listId) ?? [];
}

/** Trackables with a "mentions this page" rule for any page in `texts`. */
async function pageRuleTrackableIds(
  ctx: Ctx,
  cache: MembershipCache,
  userId: Id<"users">,
  texts: (string | undefined)[],
): Promise<Id<"trackables">[]> {
  const pageIds = new Set<string>();
  for (const text of texts) {
    if (!text || !text.includes("(page:")) continue;
    for (const id of mentionedPageIds(text)) pageIds.add(id);
  }
  if (pageIds.size === 0) return [];
  let byPage = cache.pageRules.get(userId);
  if (!byPage) {
    byPage = new Map();
    const rules = await ctx.db
      .query("trackableRules")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(1000);
    for (const rule of rules) {
      const ids = byPage.get(rule.pageId) ?? [];
      ids.push(rule.trackableId);
      byPage.set(rule.pageId, ids);
    }
    cache.pageRules.set(userId, byPage);
  }
  const out: Id<"trackables">[] = [];
  for (const pageId of pageIds) out.push(...(byPage.get(pageId) ?? []));
  return out;
}

/** The trackables a row is allocated to directly ("Tracks to"). */
export function allocatedTrackableIds(row: {
  trackableIds?: Id<"trackables">[];
  trackableId?: Id<"trackables">;
}): Id<"trackables">[] {
  return row.trackableIds ?? (row.trackableId ? [row.trackableId] : []);
}

export type TaskMembershipFields = Pick<
  Doc<"tasks">,
  "userId" | "trackableId" | "trackableIds" | "listId" | "name"
>;

export type WindowMembershipFields = Pick<
  Doc<"timeWindows">,
  | "userId"
  | "trackableId"
  | "trackableIds"
  | "taskId"
  | "listId"
  | "title"
  | "comments"
>;

async function taskTags(
  ctx: Ctx,
  cache: MembershipCache,
  task: TaskMembershipFields,
): Promise<Id<"trackables">[]> {
  return [
    ...allocatedTrackableIds(task),
    ...(await pageRuleTrackableIds(ctx, cache, task.userId, [task.name])),
    ...(await listRuleTrackableIds(ctx, cache, task.userId, task.listId)),
  ];
}

async function windowTags(
  ctx: Ctx,
  cache: MembershipCache,
  tw: WindowMembershipFields,
  task: TaskMembershipFields | null,
): Promise<Id<"trackables">[]> {
  const tags = [
    ...allocatedTrackableIds(tw),
    ...(await pageRuleTrackableIds(ctx, cache, tw.userId, [
      tw.title,
      tw.comments,
    ])),
  ];
  if (task) {
    tags.push(...(await taskTags(ctx, cache, task)));
  } else if (!tw.taskId) {
    tags.push(
      ...(await listRuleTrackableIds(ctx, cache, tw.userId, tw.listId)),
    );
  }
  return tags;
}

/**
 * Tags → the full set: each tag that still exists, then every ancestor.
 * Tags come first, in the order given, so `[0]` is the item's primary
 * trackable (used where one colour or one label is needed).
 */
async function withAncestors(
  ctx: Ctx,
  cache: MembershipCache,
  tags: Id<"trackables">[],
): Promise<Id<"trackables">[]> {
  const seen = new Set<string>();
  const direct: Doc<"trackables">[] = [];
  for (const tag of tags) {
    const doc = await loadTrackable(ctx, cache, tag);
    if (!doc || seen.has(doc._id)) continue;
    seen.add(doc._id);
    direct.push(doc);
  }
  const out: Id<"trackables">[] = direct.map((d) => d._id);
  for (const doc of direct) {
    const path = doc.ancestorIds ?? [];
    for (let i = path.length - 1; i >= 0; i--) {
      if (seen.has(path[i])) continue;
      seen.add(path[i]);
      out.push(path[i]);
    }
  }
  return out;
}

/** Every trackable a task counts toward. */
export async function resolveTaskTrackableIds(
  ctx: Ctx,
  cache: MembershipCache,
  task: TaskMembershipFields,
): Promise<Id<"trackables">[]> {
  return withAncestors(ctx, cache, await taskTags(ctx, cache, task));
}

/**
 * Every trackable a time window counts toward. Pass the window's task
 * (or `null` when it has none / the task is gone).
 */
export async function resolveWindowTrackableIds(
  ctx: Ctx,
  cache: MembershipCache,
  tw: WindowMembershipFields,
  task: TaskMembershipFields | null,
): Promise<Id<"trackables">[]> {
  return withAncestors(ctx, cache, await windowTags(ctx, cache, tw, task));
}

/**
 * What to store when a write names the "Tracks to" list (`trackableIds`)
 * or, from older callers, a single `trackableId` (`null` clears).
 * Returns `undefined` when the write did not touch either.
 */
export function tracksToPatch(args: {
  trackableIds?: Id<"trackables">[];
  trackableId?: Id<"trackables"> | null;
}):
  | {
      trackableIds: Id<"trackables">[] | undefined;
      trackableId: Id<"trackables"> | undefined;
    }
  | undefined {
  if (args.trackableIds !== undefined) {
    const ids = [...new Set(args.trackableIds)];
    return { trackableIds: ids.length > 0 ? ids : undefined, trackableId: ids[0] };
  }
  if (args.trackableId !== undefined) {
    const id = args.trackableId ?? undefined;
    return { trackableIds: id ? [id] : undefined, trackableId: id };
  }
  return undefined;
}

export function sameTrackableSet(
  a: readonly string[] | undefined,
  b: readonly string[] | undefined,
): boolean {
  if (!a || !b) return a === b;
  if (a.length !== b.length) return false;
  const set = new Set<string>(a);
  return b.every((id) => set.has(id));
}

/* ── The tree ─────────────────────────────────────────────────────────── */

/** `ancestorIds` for a trackable whose parent is `parent`. */
export function ancestorPathUnder(
  parent: Pick<Doc<"trackables">, "_id" | "ancestorIds"> | null,
): Id<"trackables">[] {
  return parent ? [...(parent.ancestorIds ?? []), parent._id] : [];
}

/** Every trackable below `rootId`, nearest first. Bounded. */
export async function loadDescendants(
  ctx: Ctx,
  rootId: Id<"trackables">,
  limit = 500,
): Promise<Doc<"trackables">[]> {
  const out: Doc<"trackables">[] = [];
  let frontier: Id<"trackables">[] = [rootId];
  while (frontier.length > 0 && out.length < limit) {
    const next: Id<"trackables">[] = [];
    for (const parentId of frontier) {
      const children = await ctx.db
        .query("trackables")
        .withIndex("by_parent", (q) => q.eq("parentId", parentId))
        .take(limit);
      for (const child of children) {
        out.push(child);
        next.push(child._id);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * Rewrite `ancestorIds` for everything below `node` after `node`'s own
 * path changed. `node` must already carry its new `ancestorIds`.
 */
export async function repathDescendants(
  ctx: MutationCtx,
  node: Pick<Doc<"trackables">, "_id" | "ancestorIds">,
): Promise<void> {
  const paths = new Map<string, Id<"trackables">[]>([
    [node._id, node.ancestorIds ?? []],
  ]);
  // `loadDescendants` is breadth-first, so a parent's path is always set
  // before its children are reached.
  for (const child of await loadDescendants(ctx, node._id)) {
    const parentPath = paths.get(child.parentId as string) ?? [];
    const path = [...parentPath, child.parentId as Id<"trackables">];
    paths.set(child._id, path);
    await ctx.db.patch(child._id, { ancestorIds: path });
  }
}
