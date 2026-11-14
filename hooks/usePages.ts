import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { PageNameLookup } from "../lib/mentions";
import { useAuth } from "./useAuth";

/**
 * Pages made in this session, by id. A page created from the "@" picker
 * is linked the moment it exists, which can be a beat before the pages
 * query has it; without this its fresh link would read as a deleted page.
 */
const createdHere = new Map<string, string>();

export function rememberCreatedPage(id: string, name: string) {
  createdHere.set(id, name);
}

/**
 * The user's pages, and a lookup from page id to current name for drawing
 * mentions (see `PageNameLookup` for what `undefined` and `null` mean).
 */
export function usePages() {
  const { profileReady } = useAuth();
  const pages = useQuery(api.pages.list, profileReady ? {} : "skip");

  return useMemo(() => {
    const byId = new Map<string, Doc<"pages">>();
    for (const p of pages ?? []) byId.set(p._id, p);
    const nameFor: PageNameLookup = (id) => {
      const page = byId.get(id);
      if (page) return page.name;
      if (pages === undefined) return undefined;
      return createdHere.get(id) ?? null;
    };
    const sorted = [...(pages ?? [])].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    return { pages: sorted, loaded: pages !== undefined, byId, nameFor };
  }, [pages]);
}
