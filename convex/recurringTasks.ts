/**
 * Recurring task series (CRUD) and instance materialization.
 *
 * Architecture (productivity-one parity):
 *   - The series is `recurringTasks` (rule + template fields).
 *   - Each occurrence is materialized as a real `tasks` row with
 *     `recurringTaskId` set and `isRecurringInstance: true`. This lets
 *     every existing feature (drag-to-calendar, complete checkbox,
 *     time tracker, edit dialog) work without synthetic-ID branches.
 *   - `deletedRecurringOccurrences` is the per-date skip set so an
 *     instance the user deleted doesn't reappear when the home page
 *     re-runs `generateInstances` on the next range expansion.
 *
 * Generation triggering:
 *   `generateInstances` is called by the client (DesktopTaskList) inside
 *   a useEffect keyed on (todayYYYYMMDD, rangeEndYYYYMMDD). It is
 *   idempotent — repeated calls for the same window do nothing because
 *   we de-dupe against existing `(recurringTaskId, taskDay)` pairs.
 */
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { requireApprovedUser, requireApprovedUserOrEmpty } from "./_helpers/auth";
import { generateOccurrences } from "./_helpers/recurrence";

const recurrenceFrequency = v.union(
  v.literal("DAILY"),
  v.literal("WEEKLY"),
  v.literal("MONTHLY"),
  v.literal("YEARLY")
);

const monthlyPattern = v.optional(
  v.union(v.literal("DAY_OF_MONTH"), v.literal("DAY_OF_WEEK"))
);

export const get = query({
  args: { id: v.id("recurringTasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return null;

    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");
    return rule;
  },
});

export const create = mutation({
  args: {
    frequency: recurrenceFrequency,
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern,
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    startDateYYYYMMDD: v.string(),
    endDateYYYYMMDD: v.optional(v.string()),
    startTimeHHMM: v.optional(v.string()),
    endTimeHHMM: v.optional(v.string()),
    name: v.string(),
    listId: v.optional(v.id("lists")),
    sectionId: v.optional(v.id("listSections")),
    trackableId: v.optional(v.id("trackables")),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeEstimatedInSeconds: v.optional(v.number()),
    /**
     * Optional task to convert into the first instance of this series.
     * The provided task gets `recurringTaskId` set and
     * `isRecurringInstance: true` — i.e. it becomes the "anchor"
     * occurrence for `startDateYYYYMMDD`. Used by TaskDetailSheet when
     * the user toggles "Repeat" on an existing task.
     */
    sourceTaskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const ruleId = await ctx.db.insert("recurringTasks", {
      frequency: args.frequency,
      interval: args.interval,
      daysOfWeek: args.daysOfWeek,
      monthlyPattern: args.monthlyPattern,
      dayOfMonth: args.dayOfMonth,
      weekOfMonth: args.weekOfMonth,
      dayOfWeekMonthly: args.dayOfWeekMonthly,
      monthOfYear: args.monthOfYear,
      startDateYYYYMMDD: args.startDateYYYYMMDD,
      endDateYYYYMMDD: args.endDateYYYYMMDD,
      startTimeHHMM: args.startTimeHHMM,
      endTimeHHMM: args.endTimeHHMM,
      name: args.name,
      listId: args.listId,
      sectionId: args.sectionId,
      sectionOrderIndex: 0,
      trackableId: args.trackableId,
      tagIds: args.tagIds,
      timeEstimatedInSeconds: args.timeEstimatedInSeconds ?? 0,
      userId: user._id,
    });

    if (args.sourceTaskId) {
      const sourceTask = await ctx.db.get(args.sourceTaskId);
      if (sourceTask && sourceTask.userId === user._id) {
        await ctx.db.patch(args.sourceTaskId, {
          recurringTaskId: ruleId,
          seriesId: ruleId,
          isRecurringInstance: true,
          isException: false,
          originalTaskDay: sourceTask.taskDay ?? undefined,
        });
      }
    }

    return ruleId;
  },
});

export const updateRule = mutation({
  args: {
    id: v.id("recurringTasks"),
    frequency: v.optional(recurrenceFrequency),
    interval: v.optional(v.number()),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern,
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    name: v.optional(v.string()),
    startDateYYYYMMDD: v.optional(v.string()),
    endDateYYYYMMDD: v.optional(v.union(v.string(), v.null())),
    startTimeHHMM: v.optional(v.union(v.string(), v.null())),
    endTimeHHMM: v.optional(v.union(v.string(), v.null())),
    listId: v.optional(v.union(v.id("lists"), v.null())),
    trackableId: v.optional(v.union(v.id("trackables"), v.null())),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeEstimatedInSeconds: v.optional(v.number()),
    /**
     * Floor (inclusive YYYYMMDD) at which to discard already-materialized
     * future instances. Matches productivity-one's "from today" behavior:
     * editing the rule wipes incomplete instances >= this day so they
     * regenerate from the new rule on next `generateInstances`.
     * Defaults to no-op (no instances are deleted) when omitted.
     */
    regenerateFromYYYYMMDD: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const patch: Record<string, unknown> = {};
    if (args.frequency) patch.frequency = args.frequency;
    if (args.interval !== undefined) patch.interval = args.interval;
    if (args.daysOfWeek !== undefined) patch.daysOfWeek = args.daysOfWeek;
    if (args.monthlyPattern !== undefined)
      patch.monthlyPattern = args.monthlyPattern;
    if (args.dayOfMonth !== undefined) patch.dayOfMonth = args.dayOfMonth;
    if (args.weekOfMonth !== undefined) patch.weekOfMonth = args.weekOfMonth;
    if (args.dayOfWeekMonthly !== undefined)
      patch.dayOfWeekMonthly = args.dayOfWeekMonthly;
    if (args.monthOfYear !== undefined) patch.monthOfYear = args.monthOfYear;
    if (args.name) patch.name = args.name;
    if (args.startDateYYYYMMDD !== undefined)
      patch.startDateYYYYMMDD = args.startDateYYYYMMDD;
    if (args.endDateYYYYMMDD !== undefined)
      patch.endDateYYYYMMDD = args.endDateYYYYMMDD ?? undefined;
    if (args.startTimeHHMM !== undefined)
      patch.startTimeHHMM = args.startTimeHHMM ?? undefined;
    if (args.endTimeHHMM !== undefined)
      patch.endTimeHHMM = args.endTimeHHMM ?? undefined;
    if (args.listId !== undefined) patch.listId = args.listId ?? undefined;
    if (args.trackableId !== undefined)
      patch.trackableId = args.trackableId ?? undefined;
    if (args.tagIds !== undefined) patch.tagIds = args.tagIds;
    if (args.timeEstimatedInSeconds !== undefined)
      patch.timeEstimatedInSeconds = args.timeEstimatedInSeconds;

    await ctx.db.patch(args.id, patch as any);

    // If the caller passes a regeneration floor, wipe future incomplete
    // instances >= that day so the next `generateInstances` re-renders
    // them from the now-updated rule. Mirrors productivity-one's
    // `update_recurring_rule` behavior.
    if (args.regenerateFromYYYYMMDD) {
      const floor = args.regenerateFromYYYYMMDD;
      const futureInstances = await ctx.db
        .query("tasks")
        .withIndex("by_recurring", (q) => q.eq("recurringTaskId", args.id))
        .collect();
      for (const t of futureInstances) {
        if (
          t.isRecurringInstance &&
          !t.dateCompleted &&
          t.taskDay &&
          t.taskDay >= floor
        ) {
          // Cascade-clean the per-instance tags table; comments and
          // time windows are also deleted so no orphan rows remain.
          const tags = await ctx.db
            .query("taskTags")
            .withIndex("by_task", (q) => q.eq("taskId", t._id))
            .collect();
          for (const tt of tags) await ctx.db.delete(tt._id);
          const windows = await ctx.db
            .query("timeWindows")
            .withIndex("by_task", (q) => q.eq("taskId", t._id))
            .collect();
          for (const w of windows) await ctx.db.delete(w._id);
          await ctx.db.delete(t._id);
        }
      }
    }
  },
});

/**
 * "Stop recurring" — sets the rule's end date to the day BEFORE
 * `effectiveFromYYYYMMDD` so any instance on/after that date stops
 * regenerating, while preserving past completed history.
 */
export const stop = mutation({
  args: {
    id: v.id("recurringTasks"),
    effectiveFromYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    // Delete future incomplete instances so they disappear immediately.
    //
    // IMPORTANT: keep all instances before `effectiveFromYYYYMMDD`
    // linked to this series. Detaching kept instances from
    // `recurringTaskId` allows `generateInstances` to recreate them as
    // duplicates because it no longer sees an existing (series,date)
    // pair.
    const instances = await ctx.db
      .query("tasks")
      .withIndex("by_recurring", (q) => q.eq("recurringTaskId", args.id))
      .collect();
    for (const t of instances) {
      if (
        t.isRecurringInstance &&
        !t.dateCompleted &&
        t.taskDay &&
        t.taskDay >= args.effectiveFromYYYYMMDD
      ) {
        const tags = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const tt of tags) await ctx.db.delete(tt._id);
        const windows = await ctx.db
          .query("timeWindows")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const w of windows) await ctx.db.delete(w._id);
        await ctx.db.delete(t._id);
      }
    }

    // Compute end date = effectiveFrom - 1 day in YYYYMMDD.
    const y = parseInt(args.effectiveFromYYYYMMDD.substring(0, 4));
    const m = parseInt(args.effectiveFromYYYYMMDD.substring(4, 6)) - 1;
    const d = parseInt(args.effectiveFromYYYYMMDD.substring(6, 8));
    const yesterday = new Date(y, m, d);
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear().toString();
    const mm = (yesterday.getMonth() + 1).toString().padStart(2, "0");
    const dd = yesterday.getDate().toString().padStart(2, "0");
    await ctx.db.patch(args.id, {
      endDateYYYYMMDD: `${yyyy}${mm}${dd}`,
    });
  },
});

/**
 * Delete a single materialized instance AND record the date in the skip
 * set so re-generation doesn't recreate it. Used by the task list's
 * delete action when the task is a recurring instance.
 */
export const deleteInstance = mutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== user._id) throw new Error("Task not found");
    if (!task.recurringTaskId || !task.taskDay) {
      throw new Error("Not a recurring instance");
    }

    // Idempotency: if the date is already in the skip set, don't insert
    // a duplicate row.
    const existingSkip = await ctx.db
      .query("deletedRecurringOccurrences")
      .withIndex("by_recurring_date", (q) =>
        q
          .eq("recurringTaskId", task.recurringTaskId!)
          .eq("deletedDateYYYYMMDD", task.taskDay!)
      )
      .first();
    if (!existingSkip) {
      await ctx.db.insert("deletedRecurringOccurrences", {
        recurringTaskId: task.recurringTaskId,
        deletedDateYYYYMMDD: task.taskDay,
        userId: user._id,
      });
    }

    // Cascade-clean per-task children — same shape as `tasks.remove` so
    // we don't leave orphans behind.
    const tags = await ctx.db
      .query("taskTags")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const tt of tags) await ctx.db.delete(tt._id);
    const comments = await ctx.db
      .query("taskComments")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const c of comments) await ctx.db.delete(c._id);

    const windows = await ctx.db
      .query("timeWindows")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    for (const w of windows) await ctx.db.delete(w._id);

    await ctx.db.delete(args.taskId);
  },
});

/**
 * Series delete — wipes the rule, every instance (completed and not),
 * and all skip-set rows. Used by "delete all instances" UI action.
 */
export const remove = mutation({
  args: { id: v.id("recurringTasks") },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const rule = await ctx.db.get(args.id);
    if (!rule || rule.userId !== user._id) throw new Error("Not found");

    const deletedOccs = await ctx.db
      .query("deletedRecurringOccurrences")
      .withIndex("by_recurring_task", (q) => q.eq("recurringTaskId", args.id))
      .collect();
    for (const d of deletedOccs) await ctx.db.delete(d._id);

    const tasks = await ctx.db
      .query("tasks")
      .withIndex("by_recurring", (q) => q.eq("recurringTaskId", args.id))
      .collect();
    for (const t of tasks) {
      if (t.isRecurringInstance) {
        const tags = await ctx.db
          .query("taskTags")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const tt of tags) await ctx.db.delete(tt._id);
        const comments = await ctx.db
          .query("taskComments")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const c of comments) await ctx.db.delete(c._id);
        const windows = await ctx.db
          .query("timeWindows")
          .withIndex("by_task", (q) => q.eq("taskId", t._id))
          .collect();
        for (const w of windows) await ctx.db.delete(w._id);
        await ctx.db.delete(t._id);
      } else {
        await ctx.db.patch(t._id, { recurringTaskId: undefined });
        await ctx.db.patch(t._id, {
          seriesId: undefined,
          isException: false,
          originalTaskDay: undefined,
        });
      }
    }

    await ctx.db.delete(args.id);
  },
});

/**
 * Idempotently materializes any missing recurring instances whose dates
 * fall in [rangeStart, rangeEnd] for every rule belonging to the user.
 *
 * Idempotent because we de-dupe against existing
 * `(recurringTaskId, taskDay)` pairs before inserting. Callers can fire
 * this on every range change without worrying about creating duplicates.
 *
 * Returns the count of instances actually inserted (mostly for tests /
 * debugging — the client doesn't need to read this).
 */
export const generateInstances = mutation({
  args: {
    rangeStartYYYYMMDD: v.string(),
    rangeEndYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);

    const rules = await ctx.db
      .query("recurringTasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();

    let createdCount = 0;

    for (const rule of rules) {
      // Skip rules that can't possibly produce occurrences in this
      // window — keeps the per-rule day-walk in `generateOccurrences`
      // from running needlessly.
      if (rule.startDateYYYYMMDD > args.rangeEndYYYYMMDD) continue;
      if (
        rule.endDateYYYYMMDD &&
        rule.endDateYYYYMMDD < args.rangeStartYYYYMMDD
      ) {
        continue;
      }

      const skipRows = await ctx.db
        .query("deletedRecurringOccurrences")
        .withIndex("by_recurring_task", (q) =>
          q.eq("recurringTaskId", rule._id)
        )
        .collect();
      const deletedDates = new Set(skipRows.map((r) => r.deletedDateYYYYMMDD));

      const existing = await ctx.db
        .query("tasks")
        .withIndex("by_recurring", (q) => q.eq("recurringTaskId", rule._id))
        .collect();
      const existingDates = new Set(
        existing.filter((t) => t.taskDay).map((t) => t.taskDay!)
      );

      const occs = generateOccurrences(
        rule,
        args.rangeStartYYYYMMDD,
        args.rangeEndYYYYMMDD,
        deletedDates
      );

      for (const date of occs) {
        if (existingDates.has(date)) continue;

        const taskId = await ctx.db.insert("tasks", {
          name: rule.name,
          taskDay: date,
          listId: rule.listId,
          sectionId: rule.sectionId,
          sectionOrderIndex: rule.sectionOrderIndex ?? 0,
          trackableId: rule.trackableId,
          recurringTaskId: rule._id,
          seriesId: rule._id,
          isRecurringInstance: true,
          isException: false,
          originalTaskDay: date,
          timeSpentInSecondsUnallocated: 0,
          timeEstimatedInSecondsUnallocated:
            rule.timeEstimatedInSeconds ?? 0,
          taskDayOrderIndex: 0,
          userId: user._id,
          createdBy: user._id,
        });
        // `rootTaskId` matches the task's own id for top-level tasks
        // (mirrors `tasks.upsert` initialization).
        await ctx.db.patch(taskId, { rootTaskId: taskId });
        createdCount++;

        // Materialize the rule's tag set onto the new instance so tag
        // filters work on the instance the moment it appears.
        if (rule.tagIds && rule.tagIds.length > 0) {
          for (const tagId of rule.tagIds) {
            await ctx.db.insert("taskTags", { taskId, tagId });
          }
        }

        // If the rule carries a default time window (start/end times),
        // create a planned `timeWindows` row for the calendar to pick
        // up. Mirrors productivity-one's `generate_recurring_instances`
        // behavior so a recurring task with a scheduled time auto-
        // populates the calendar each occurrence.
        if (rule.startTimeHHMM && rule.endTimeHHMM) {
          const dur = computeDurationSeconds(
            rule.startTimeHHMM,
            rule.endTimeHHMM
          );
          if (dur > 0) {
            // NOTE: do NOT set `listId` on a TASK time window. The
            // title-derivation hierarchy in `timeWindows.search`
            // checks `directListDoc?.name` BEFORE `task?.name`, so a
            // populated `listId` would show the list name instead of
            // the task name on the calendar block. The task row
            // already carries the listId, so the calendar's
            // colour-stripe rule still resolves correctly via
            // `taskListDoc`. Mirrors the regular task-scheduling
            // path in `convex/tasks.ts` (which also omits listId on
            // its time window insert).
            await ctx.db.insert("timeWindows", {
              startTimeHHMM: rule.startTimeHHMM,
              startDayYYYYMMDD: date,
              durationSeconds: dur,
              userId: user._id,
              budgetType: "ACTUAL",
              activityType: "TASK",
              taskId,
              trackableId: rule.trackableId,
              timeZone: "UTC",
              isRecurringInstance: false,
              source: "calendar",
            });
          }
        }
      }
    }

    return { created: createdCount };
  },
});

/**
 * Helper: best-effort parse of `HH:MM` → seconds since midnight, then
 * difference. Negative or invalid inputs return 0 so the caller can
 * skip creating a degenerate time window.
 */
function computeDurationSeconds(start: string, end: string): number {
  const parse = (s: string) => {
    const [h, m] = s.split(":").map((x) => parseInt(x, 10));
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return h * 3600 + m * 60;
  };
  const s = parse(start);
  const e = parse(end);
  if (s === null || e === null) return 0;
  return Math.max(0, e - s);
}

/**
 * Bulk read for the home/list/calendar pages. Returns the recurring
 * series the current user owns, indexed by id, so the UI can show
 * "this is a recurring task" badges and pre-fill the dialog without
 * issuing a `get` per task.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireApprovedUserOrEmpty(ctx);
    if (!user) return [];

    return await ctx.db
      .query("recurringTasks")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

/**
 * Mark a recurring occurrence as an exception.
 *
 * Used when the user selects "This instance only" in the edit-scope modal.
 * The base recurrence rule remains unchanged; the selected occurrence gets
 * an explicit override marker and can optionally be detached from the series.
 */
export const applyInstanceOverride = mutation({
  args: {
    taskId: v.id("tasks"),
    originalTaskDay: v.optional(v.string()),
    detachFromSeries: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.userId !== user._id) throw new Error("Task not found");
    if (!task.recurringTaskId) throw new Error("Not a recurring instance");

    const patch: Record<string, unknown> = {
      isException: true,
      originalTaskDay: args.originalTaskDay ?? task.originalTaskDay ?? task.taskDay,
    };

    if (args.detachFromSeries) {
      patch.recurringTaskId = undefined;
      patch.seriesId = undefined;
      patch.isRecurringInstance = false;
    } else {
      patch.seriesId = task.recurringTaskId;
      patch.isRecurringInstance = true;
    }

    await ctx.db.patch(args.taskId, patch as any);
  },
});

/**
 * Ensure a date is skipped for a series (idempotent).
 *
 * Needed when a single occurrence is moved to another day so the original
 * generated date is not recreated on the next materialization pass.
 */
export const recordDeletedOccurrence = mutation({
  args: {
    recurringTaskId: v.id("recurringTasks"),
    deletedDateYYYYMMDD: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireApprovedUser(ctx);
    const existing = await ctx.db
      .query("deletedRecurringOccurrences")
      .withIndex("by_recurring_date", (q) =>
        q
          .eq("recurringTaskId", args.recurringTaskId)
          .eq("deletedDateYYYYMMDD", args.deletedDateYYYYMMDD)
      )
      .first();
    if (existing) return existing._id;

    return await ctx.db.insert("deletedRecurringOccurrences", {
      recurringTaskId: args.recurringTaskId,
      deletedDateYYYYMMDD: args.deletedDateYYYYMMDD,
      userId: user._id,
    });
  },
});

// Re-export the Id type so callers don't need to dig into _generated.
export type RecurringTaskId = Id<"recurringTasks">;
