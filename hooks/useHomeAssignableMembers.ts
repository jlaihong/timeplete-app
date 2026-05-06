import { useMemo } from "react";
import { useQueries } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc, Id } from "../convex/_generated/dataModel";
import { normalizeListMembersQuery } from "../lib/listMembersQuery";
import type { TaskFilterMember } from "../lib/taskFilters";

type SharedWithMeAccepted = {
  listShares: Array<{ listId: Id<"lists"> }>;
};

/**
 * Same assignable population as List detail (`OWNER` + `EDITOR` from
 * `getListMembers`), deduped across owned lists (`lists.search`) and lists
 * shared with the viewer (ACCEPTED `getSharedWithMe`). Uses only
 * already-deployed Convex queries.
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

  const queries = useMemo(() => {
    if (!allListIds.length) return {};
    const o: Record<
      string,
      { query: typeof api.sharing.getListMembers; args: { listId: Id<"lists"> } }
    > = {};
    for (const id of allListIds) {
      o[id] = {
        query: api.sharing.getListMembers,
        args: { listId: id as Id<"lists"> },
      };
    }
    return o;
  }, [allListIds]);

  const results = useQueries(queries);

  return useMemo(() => {
    if (!allListIds.length) return [];
    const byUserId = new Map<string, TaskFilterMember>();
    for (const listId of allListIds) {
      const res = results[listId];
      if (res instanceof Error || res === undefined) continue;
      const normalized = normalizeListMembersQuery(res);
      if (!normalized) continue;
      for (const m of normalized.members) {
        if (m.permission !== "OWNER" && m.permission !== "EDITOR") continue;
        byUserId.set(String(m.userId), {
          userId: String(m.userId),
          name: m.name,
        });
      }
    }
    return [...byUserId.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [allListIds, results]);
}
