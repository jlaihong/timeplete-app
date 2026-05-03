import { useSegments } from "expo-router";
import { useQuery } from "convex/react";
import { useMemo } from "react";
import { api } from "../convex/_generated/api";

export type DrawerSelection = {
  home: boolean;
  inbox: boolean;
  goals: boolean;
  calendar: boolean;
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
  calendar: false,
  analytics: false,
  reviews: false,
  tags: false,
  allLists: false,
  shared: false,
  activeListId: null,
};

/**
 * Maps the current expo-router segments to which drawer row should appear selected.
 */
export function useDrawerSelection(): DrawerSelection {
  const segments = useSegments();
  const lists = useQuery(api.lists.search, {});
  const inboxId = useMemo(() => {
    if (!lists) return null;
    const candidates = lists.filter((l) => l.isInbox && !l.archived);
    if (candidates.length === 0) return null;
    return [...candidates].sort((a, b) => a.orderIndex - b.orderIndex)[0]
      ._id;
  }, [lists]);

  const s = segments as string[];
  if (s[0] !== "(app)") return empty;

  const g1 = s[1];
  const g2 = s[2];

  if (g1 === "(tabs)") {
    const tab = g2;
    if (tab === undefined || tab === "index") return { ...empty, home: true };
    if (tab === "goals") return { ...empty, goals: true };
    if (tab === "calendar") return { ...empty, calendar: true };
    if (tab === "analytics") return { ...empty, analytics: true };
    if (tab === "reviews") return { ...empty, reviews: true };
    return empty;
  }

  if (g1 === "tags") return { ...empty, tags: true };

  if (g1 === "inbox") return { ...empty, inbox: true };

  if (g1 === "lists") {
    if (g2) {
      // Productivity-one: Inbox is `/lists/:inboxId`, not a separate route.
      if (inboxId && g2 === inboxId) return { ...empty, inbox: true };
      return { ...empty, activeListId: g2 };
    }
    return { ...empty, allLists: true };
  }

  if (g1 === "shared") return { ...empty, shared: true };

  return empty;
}
