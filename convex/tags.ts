/**
 * Compatibility only. Tags were removed (pages replaced them), but app
 * builds released before that still call these functions: the phone app
 * loads tags on its task lists, so without `search` its Home screen would
 * fail to load.
 *
 * `search` answers "no tags"; the editing functions say tags are gone.
 * Delete this file once no installed build predates tag removal.
 */
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const GONE = "Tags have been removed. Update the app to keep organising with pages and trackables.";

export const search = query({
  args: {},
  handler: async () => [],
});

export const upsert = mutation({
  args: {
    id: v.optional(v.string()),
    name: v.string(),
    colour: v.string(),
    archived: v.optional(v.boolean()),
  },
  handler: async () => {
    throw new Error(GONE);
  },
});

export const move = mutation({
  args: { id: v.string(), toIndex: v.number() },
  handler: async () => {
    throw new Error(GONE);
  },
});

export const remove = mutation({
  args: { id: v.string() },
  handler: async () => {
    throw new Error(GONE);
  },
});
