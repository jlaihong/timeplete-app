import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import type { TaskFilterMember } from "../lib/taskFilters";

type SharedWithMeAccepted = {
  listShares: Array<{ listId: Id<"lists"> }>;
};

/**
 * Same assignable population as List detail (`OWNER` + `EDITOR` from
 * `getListMembers`), deduped across owned lists (`lists.search`) and lists
 * shared with the viewer (ACCEPTED `getSharedWithMe`).
 *
 * Uses the batched `sharing.getAssignableMembers` query — ONE reactive
 * subscription for the whole set instead of one `getListMembers`
 * subscription per list (which re-executed ~listCount queries on every
 * auth refresh / invalidation and dominated idle read bandwidth).
 */
export function useHomeAssignableMembers(
  ownedLists: Doc<"lists">[] | undefined,
  sharedWithMe: SharedWithMeAccepted | undefined,
): TaskFilterMember[] {
  const allListIds = useMemo(() => {
    const ids = new Set<string>();
    ownedLists?.forEach((l) => ids.add(l._id));
    sharedWithMe?.listShares.forEach((s) => ids.add(s.listId));
    return [...ids].sort();
  }, [ownedLists, sharedWithMe]);

  const result = useQuery(
    api.sharing.getAssignableMembers,
    allListIds.length
      ? { listIds: allListIds as Id<"lists">[] }
      : "skip",
  );

  return useMemo(() => {
    if (!result) return [];
    return result.members.map((m) => ({
      userId: String(m.userId),
      name: m.name,
    }));
  }, [result]);
}
