/**
 * Backfill `useTimeZone: false` on all existing calendar rows and
 * recurring rules so they adopt floating wall-clock layout.
 *
 * New product default: HHMM is floating unless the user explicitly
 * enables "Use Time Zone" for meetings. Legacy / migrated rows had no
 * flag and were incorrectly converted through their stamped IANA zone
 * (or UTC), which shifted personal routines on the calendar.
 *
 * Idempotent — rows already `useTimeZone === false` are skipped.
 */

import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

const vResult = v.object({
  windowsPatched: v.number(),
  recurringEventsPatched: v.number(),
  recurringTasksPatched: v.number(),
});

export const run = internalMutation({
  args: {},
  returns: vResult,
  handler: async (ctx) => {
    let windowsPatched = 0;
    let recurringEventsPatched = 0;
    let recurringTasksPatched = 0;

    const windows = await ctx.db.query("timeWindows").collect();
    for (const w of windows) {
      if (w.useTimeZone === false) continue;
      await ctx.db.patch(w._id, { useTimeZone: false });
      windowsPatched++;
    }

    const events = await ctx.db.query("recurringEvents").collect();
    for (const r of events) {
      if (r.useTimeZone === false) continue;
      await ctx.db.patch(r._id, { useTimeZone: false });
      recurringEventsPatched++;
    }

    const tasks = await ctx.db.query("recurringTasks").collect();
    for (const r of tasks) {
      if (r.useTimeZone === false) continue;
      await ctx.db.patch(r._id, { useTimeZone: false });
      recurringTasksPatched++;
    }

    return {
      windowsPatched,
      recurringEventsPatched,
      recurringTasksPatched,
    };
  },
});
