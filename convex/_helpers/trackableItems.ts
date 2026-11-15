/**
 * The index behind "What counted": one small row per thing per trackable
 * it counts toward (`trackableItems`).
 *
 * A task or window lists the trackables it counts toward on its own row,
 * and a list cannot be indexed by what it contains. Without this table,
 * "everything that counted toward Family" means reading rows and checking
 * each one. With it, a trackable's items are read directly, newest first,
 * a page at a time, however far back they go.
 *
 * `setTrackableItems` makes the rows for one source match a given set of
 * trackables. It is called from the same places that keep totals
 * (`trackableLifetime.ts`), with the same set, so the two cannot drift;
 * and it is safe to repeat, which lets `trackableResync` rebuild or
 * backfill the table by re-running it.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { isYYYYMMDDCompact, toCompactYYYYMMDD } from "./compactYYYYMMDD";

/** What a row points at. A check-in is one trackable's tick on one day. */
export type ItemSource =
  | { kind: "event"; windowId: Id<"timeWindows"> }
  | { kind: "task"; taskId: Id<"tasks"> }
  | { kind: "value"; entryId: Id<"trackerEntries"> }
  | { kind: "checkIn"; sourceTrackableId: Id<"trackables">; dayYYYYMMDD: string };

async function existingRows(
  ctx: MutationCtx,
  source: ItemSource,
): Promise<Doc<"trackableItems">[]> {
  const LIMIT = 100;
  switch (source.kind) {
    case "event":
      return await ctx.db
        .query("trackableItems")
        .withIndex("by_window", (q) => q.eq("windowId", source.windowId))
        .take(LIMIT);
    case "task":
      return await ctx.db
        .query("trackableItems")
        .withIndex("by_task", (q) => q.eq("taskId", source.taskId))
        .take(LIMIT);
    case "value":
      return await ctx.db
        .query("trackableItems")
        .withIndex("by_entry", (q) => q.eq("entryId", source.entryId))
        .take(LIMIT);
    case "checkIn":
      return (
        await ctx.db
          .query("trackableItems")
          .withIndex("by_source_day", (q) =>
            q
              .eq("sourceTrackableId", source.sourceTrackableId)
              .eq("dayYYYYMMDD", toCompactYYYYMMDD(source.dayYYYYMMDD)),
          )
          .take(LIMIT)
      ).filter((row) => row.kind === "checkIn");
  }
}

/**
 * Make the index say that `source` counts toward exactly `trackableIds`
 * on `day`. Pass an empty list (or no valid day) when it counts toward
 * nothing: deleted, not completed, a planned rather than actual event.
 */
export async function setTrackableItems(
  ctx: MutationCtx,
  source: ItemSource,
  userId: Id<"users">,
  trackableIds: readonly Id<"trackables">[],
  day: string | undefined,
): Promise<void> {
  const compact = day ? toCompactYYYYMMDD(day) : "";
  const wanted = new Set<string>(isYYYYMMDDCompact(compact) ? trackableIds : []);
  const rows = await existingRows(ctx, source);
  // The common case, checked before writing anything: nothing to do.
  if (rows.length === 0 && wanted.size === 0) return;

  const have = new Set<string>();
  for (const row of rows) {
    if (!wanted.has(row.trackableId) || have.has(row.trackableId)) {
      await ctx.db.delete(row._id);
      continue;
    }
    have.add(row.trackableId);
    if (row.dayYYYYMMDD !== compact) {
      await ctx.db.patch(row._id, { dayYYYYMMDD: compact });
    }
  }
  for (const trackableId of wanted) {
    if (have.has(trackableId)) continue;
    await ctx.db.insert("trackableItems", {
      userId,
      trackableId: trackableId as Id<"trackables">,
      dayYYYYMMDD: compact,
      kind: source.kind,
      windowId: source.kind === "event" ? source.windowId : undefined,
      taskId: source.kind === "task" ? source.taskId : undefined,
      entryId: source.kind === "value" ? source.entryId : undefined,
      sourceTrackableId:
        source.kind === "checkIn" ? source.sourceTrackableId : undefined,
    });
  }
}

/**
 * Something logged by hand on a trackable (a value, or a day's check-in)
 * counts toward that trackable and everything above it.
 */
export async function setManualItems(
  ctx: MutationCtx,
  source: Extract<ItemSource, { kind: "value" | "checkIn" }>,
  trackableId: Id<"trackables">,
  day: string | undefined,
  present: boolean,
): Promise<void> {
  const trackable = await ctx.db.get(trackableId);
  if (!trackable) {
    // The trackable is gone; `trackableResync.deleteItems` clears its rows.
    return;
  }
  await setTrackableItems(
    ctx,
    source,
    trackable.userId,
    present ? [trackable._id, ...(trackable.ancestorIds ?? [])] : [],
    day,
  );
}
