import { useSegments } from "expo-router";

export type DrawerSelection = {
  home: boolean;
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
  goals: false,
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
  const s = segments as string[];
  if (s[0] !== "(app)") return empty;

  const g1 = s[1];
  const g2 = s[2];

  if (g1 === "(tabs)") {
    const tab = g2;
    if (tab === undefined || tab === "index") return { ...empty, home: true };
    if (tab === "goals") return { ...empty, goals: true };
    if (tab === "analytics") return { ...empty, analytics: true };
    if (tab === "reviews") return { ...empty, reviews: true };
    return empty;
  }

  if (g1 === "tags") return { ...empty, tags: true };

  if (g1 === "lists") {
    if (g2) return { ...empty, activeListId: g2 };
    return { ...empty, allLists: true };
  }

  if (g1 === "shared") return { ...empty, shared: true };

  return empty;
}
