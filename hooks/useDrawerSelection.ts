import { usePathname } from "expo-router";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../convex/_generated/api";
import { useAuth } from "./useAuth";

export type DrawerSelection = {
  home: boolean;
  inbox: boolean;
  goals: boolean;
  analytics: boolean;
  reviews: boolean;
  tags: boolean;
  allLists: boolean;
  shared: boolean;
  /** Set when viewing a single list; value is the list document id string. */
  activeListId: string | null;
};

const empty: DrawerSelection = {
  home: false,
  inbox: false,
  goals: false,
  analytics: false,
  reviews: false,
  tags: false,
  allLists: false,
  shared: false,
  activeListId: null,
};

function normalizePathname(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Maps the current route to which drawer row should appear selected.
 *
 * Uses `usePathname()` (resolved dynamic segments) instead of `useSegments()`:
 * Expo Router's segments array keeps template parts like `[listId]`, so comparing
 * to real list ids never matched and list/inbox rows never showed as focused.
 */
export function useDrawerSelection(): DrawerSelection {
  const pathname = usePathname();
  const { profileReady } = useAuth();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");
  const inboxId = useMemo(() => {
    if (!lists) return null;
    const candidates = lists.filter((l) => l.isInbox && !l.archived);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => a.orderIndex - b.orderIndex)[0]
      ._id;
  }, [lists]);

  return useMemo(() => {
    const path = normalizePathname(pathname);

    if (path === "/") {
      return { ...empty, home: true };
    }

    if (path === "/goals") return { ...empty, goals: true };
    if (path === "/analytics") return { ...empty, analytics: true };
    if (path === "/reviews") return { ...empty, reviews: true };

    if (path === "/tags" || path.startsWith("/tags/")) {
      return { ...empty, tags: true };
    }

    if (path === "/shared" || path.startsWith("/shared/")) {
      return { ...empty, shared: true };
    }

    if (path === "/inbox" || path.startsWith("/inbox/")) {
      return { ...empty, inbox: true };
    }

    const listsMatch = path.match(/^\/lists(?:\/([^/]+))?$/);
    if (listsMatch) {
      const id = listsMatch[1];
      if (!id) {
        return { ...empty, allLists: true };
      }
      if (inboxId && id === inboxId) {
        return { ...empty, inbox: true };
      }
      return { ...empty, activeListId: id };
    }

    return empty;
  }, [pathname, inboxId]);
}
