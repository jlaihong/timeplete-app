/**
 * Fix wall-clock shifts on migrated `timeWindows` rows stamped
 * `timeZone: "UTC"`.
 *
 * In productivity-one, `start_time_hhmm` was a plain wall-clock string —
 * the calendar rendered it verbatim and NEVER converted through
 * `time_windows.time_zone`. The legacy backend hardcoded
 * `time_zone='UTC'` when generating recurring instances (and some older
 * write paths defaulted to it), so the dump contains rows like
 * `11:00 + UTC` that really mean "11:00 on the user's local clock".
 *
 * Timeplete's calendar DOES honour `timeZone` (it converts the row's
 * wall clock into the grid zone), so those rows render shifted by the
 * UTC offset (e.g. 11:00 → 4:00 AM in America/Vancouver).
 *
 * Repair: for every MIGRATED row (`legacyId` set) with `timeZone: "UTC"`,
 * re-stamp the zone the wall clock was actually authored in:
 *   1. the linked `recurringEvents` rule's zone, when there is one, else
 *   2. the user's dominant non-UTC zone across their other windows.
 * Rows with no derivable zone are left untouched (genuinely-UTC users
 * keep rendering identically). HH:MM values are never modified.
 *
 * Idempotent — second run finds nothing left to patch. The same
 * derivation is baked into `scripts/migration/extract.ts` for future
 * (prod) migration runs; this mutation exists to repair deployments
 * loaded before that fix. Delete with the rest of `_admin/` in Phase 6.
 */

import { internalMutation, internalQuery } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

function dominantNonUtcZone(windows: Doc<"timeWindows">[]): string | undefined {
  const counts = new Map<string, number>();
  for (const w of windows) {
    const tz = (w.timeZone ?? "").trim();
    if (!tz || tz === "UTC") continue;
    counts.set(tz, (counts.get(tz) ?? 0) + 1);
  }
  let dominant: string | undefined;
  let max = 0;
  for (const [tz, c] of counts) {
    if (c > max) {
      max = c;
      dominant = tz;
    }
  }
  return dominant;
}

async function collectPatches(
  ctx: QueryCtx | MutationCtx,
): Promise<Array<{ window: Doc<"timeWindows">; newZone: string }>> {
  const users = await ctx.db.query("users").collect();
  const patches: Array<{ window: Doc<"timeWindows">; newZone: string }> = [];

  for (const user of users) {
    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const dominant = dominantNonUtcZone(windows);
    const ruleZoneCache = new Map<string, string | undefined>();

    for (const w of windows) {
      if (!w.legacyId) continue; // only migrated rows
      if ((w.timeZone ?? "").trim() !== "UTC") continue;

      let zone: string | undefined;
      if (w.recurringEventId) {
        const key = String(w.recurringEventId);
        if (!ruleZoneCache.has(key)) {
          const rule = await ctx.db.get(w.recurringEventId);
          const ruleTz = (rule?.timeZone ?? "").trim();
          ruleZoneCache.set(key, ruleTz && ruleTz !== "UTC" ? ruleTz : undefined);
        }
        zone = ruleZoneCache.get(key);
      }
      zone = zone ?? dominant;
      if (!zone) continue;
      patches.push({ window: w, newZone: zone });
    }
  }
  return patches;
}

export const runAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    const patches = await collectPatches(ctx);
    const byZone: Record<string, number> = {};
    for (const { window, newZone } of patches) {
      await ctx.db.patch(window._id, { timeZone: newZone });
      byZone[newZone] = (byZone[newZone] ?? 0) + 1;
    }
    return { patched: patches.length, byZone };
  },
});

/** Read-only preview of what runAll would change. */
export const auditPending = internalQuery({
  args: {},
  handler: async (ctx) => {
    const patches = await collectPatches(ctx);
    const byZone: Record<string, number> = {};
    for (const { newZone } of patches) {
      byZone[newZone] = (byZone[newZone] ?? 0) + 1;
    }
    const sample = patches.slice(0, 10).map(({ window, newZone }) => ({
      title: window.title,
      startDayYYYYMMDD: window.startDayYYYYMMDD,
      startTimeHHMM: window.startTimeHHMM,
      newZone,
      isRecurringInstance: window.isRecurringInstance,
    }));
    return { pending: patches.length, byZone, sample };
  },
});
