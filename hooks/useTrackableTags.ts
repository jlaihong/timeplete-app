import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Doc } from "../convex/_generated/dataModel";
import type { PageNameLookup } from "../lib/mentions";
import { useAuth } from "./useAuth";

/**
 * The user's trackables as "@" tags: the ones on offer in the mention
 * picker (not archived, sorted by their place in the tree) and lookups
 * for drawing a tag with its trackable's current name and colour.
 *
 * A trackable that is not in the list gives `undefined`, so the tag is
 * drawn with the name stored in the text (it may be someone else's on a
 * shared list).
 */
export function useTrackableTags() {
  const { profileReady } = useAuth();
  const all = useQuery(api.trackables.search, profileReady ? {} : "skip");

  return useMemo(() => {
    const byId = new Map<string, Doc<"trackables">>();
    for (const t of all ?? []) byId.set(t._id, t);
    const pathOf = (t: Doc<"trackables">) =>
      [...(t.ancestorIds ?? []), t._id]
        .map((id) => byId.get(id)?.name ?? "")
        .join(" / ");
    const options = (all ?? [])
      .filter((t) => !t.archived)
      .map((t) => ({ trackable: t, name: t.name, path: pathOf(t) }))
      .sort((a, b) => a.path.localeCompare(b.path));
    const nameFor: PageNameLookup = (id) => byId.get(id)?.name;
    const colourFor = (id: string): string | undefined => byId.get(id)?.colour;
    return { options, byId, nameFor, colourFor, loaded: all !== undefined };
  }, [all]);
}
