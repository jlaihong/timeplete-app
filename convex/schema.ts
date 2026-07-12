import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    tokenIdentifier: v.string(),
    name: v.string(),
    email: v.string(),
    isApproved: v.boolean(),
    /**
     * Legacy primary key from the productivity-app Postgres dump. Set during
     * the one-shot migration so the loader is idempotent and the
     * Cognito-fallback re-hash step can find the right account by old UUID.
     */
    legacyId: v.optional(v.string()),
  })
    .index("by_token", ["tokenIdentifier"])
    .index("by_email", ["email"])
    .index("by_legacy", ["legacyId"]),

  tags: defineTable({
    name: v.string(),
    colour: v.string(),
    orderIndex: v.number(),
    userId: v.id("users"),
    archived: v.boolean(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "orderIndex"])
    .index("by_legacy", ["legacyId"]),

  lists: defineTable({
    name: v.string(),
    colour: v.string(),
    orderIndex: v.number(),
    userId: v.id("users"),
    archived: v.boolean(),
    isGoalList: v.boolean(),
    showInSidebar: v.boolean(),
    isInbox: v.boolean(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "orderIndex"])
    .index("by_legacy", ["legacyId"]),

  listSections: defineTable({
    listId: v.id("lists"),
    name: v.string(),
    orderIndex: v.number(),
    isDefaultSection: v.boolean(),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_list", ["listId"])
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  tasks: defineTable({
    rootTaskId: v.optional(v.id("tasks")),
    name: v.string(),
    parentId: v.optional(v.id("tasks")),
    dateCompleted: v.optional(v.string()),
    timeSpentInSecondsUnallocated: v.number(),
    timeEstimatedInSecondsUnallocated: v.number(),
    dueDateYYYYMMDD: v.optional(v.string()),
    listId: v.optional(v.id("lists")),
    taskDay: v.optional(v.string()),
    taskDayOrderIndex: v.number(),
    sectionId: v.optional(v.id("listSections")),
    sectionOrderIndex: v.number(),
    trackableId: v.optional(v.id("trackables")),
    recurringTaskId: v.optional(v.id("recurringTasks")),
    /** Explicit series link used by scoped recurring edits. */
    seriesId: v.optional(v.id("recurringTasks")),
    isRecurringInstance: v.boolean(),
    /** True when this occurrence overrides the base recurrence rule. */
    isException: v.optional(v.boolean()),
    /** Original generated date before an exception moved the task. */
    originalTaskDay: v.optional(v.string()),
    userId: v.id("users"),
    createdBy: v.id("users"),
    assignedToUserId: v.optional(v.id("users")),
    /**
     * Denormalized copy of `taskTags.tagId` rows for this task. Maintained
     * by `tasks.upsert` and the recurring writers. Lets readers like
     * `tasks.search` and `lists.getPaginated` enrich rows without scanning
     * the entire `taskTags` table (previously the single largest source of
     * read bandwidth for list views).
     *
     * `taskTags` rows are still maintained for tag-lookup queries; treat
     * them as a secondary index, not the source of truth. When the field
     * is `undefined` on legacy rows the readers fall back to `taskTags`.
     */
    tagIds: v.optional(v.array(v.id("tags"))),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_day", ["userId", "taskDay"])
    .index("by_list", ["listId"])
    .index("by_section", ["sectionId"])
    .index("by_recurring", ["recurringTaskId"])
    .index("by_root", ["rootTaskId"])
    .index("by_trackable", ["trackableId"])
    .index("by_user", ["userId"])
    // Drives the home page's overdue + recently-completed reads without
    // scanning the user's entire task history.
    //   - Overdue:           `eq(userId).eq(dateCompleted, undefined).lt(taskDay, today)`
    //     → walks only OPEN tasks whose scheduled day is in the past.
    //   - Completed-in-window: `eq(userId).gte(dateCompleted, today).lte(dateCompleted, rangeEnd)`
    //     → walks only tasks completed inside the visible window.
    // Both used to share a `by_user_day` scan that pulled every task
    // ever scheduled before `today` — quadratic with completed history.
    .index("by_user_completed_day", ["userId", "dateCompleted", "taskDay"])
    // Overdue-scan companion to `by_user_completed_day` that additionally
    // pins `isRecurringInstance`. The home page's Overdue group excludes
    // recurring instances, and on real data ~95% of open past-day rows ARE
    // recurring instances (stale daily occurrences) — the old scan read
    // them all just to discard them in JS. Pinning the flag in the index
    // means those rows are never read at all:
    //   `eq(userId).eq(isRecurringInstance, false).eq(dateCompleted, undefined)
    //    .gt(taskDay, "").lt(taskDay, today)`
    .index("by_user_recurring_completed_day", [
      "userId",
      "isRecurringInstance",
      "dateCompleted",
      "taskDay",
    ])
    .index("by_legacy", ["legacyId"]),

  taskTags: defineTable({
    taskId: v.id("tasks"),
    tagId: v.id("tags"),
    legacyId: v.optional(v.string()),
  })
    .index("by_task", ["taskId"])
    .index("by_tag", ["tagId"])
    .index("by_legacy", ["legacyId"]),

  taskDays: defineTable({
    userId: v.id("users"),
    dayYYYYMMDD: v.string(),
    taskId: v.id("tasks"),
    orderIndex: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_day", ["userId", "dayYYYYMMDD"])
    .index("by_task", ["taskId"])
    .index("by_legacy", ["legacyId"]),

  userTaskDayOrder: defineTable({
    userId: v.id("users"),
    taskId: v.id("tasks"),
    taskDay: v.string(),
    orderIndex: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_task", ["userId", "taskId"])
    .index("by_user_day", ["userId", "taskDay"])
    .index("by_legacy", ["legacyId"]),

  taskListOrdering: defineTable({
    userId: v.id("users"),
    listId: v.id("lists"),
    taskId: v.id("tasks"),
    orderIndex: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_list", ["userId", "listId"])
    .index("by_task", ["taskId"])
    .index("by_legacy", ["legacyId"]),

  rootTaskOrdering: defineTable({
    userId: v.id("users"),
    rootTaskId: v.id("tasks"),
    taskId: v.id("tasks"),
    orderIndex: v.number(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_root", ["userId", "rootTaskId"])
    .index("by_task", ["taskId"])
    .index("by_legacy", ["legacyId"]),

  timeWindows: defineTable({
    startTimeHHMM: v.string(),
    startDayYYYYMMDD: v.string(),
    /**
     * Canonical UTC instant for the window start. Layout / rendering should
     * derive wall-clock position from this + `timeZone`; `startTimeHHMM` is
     * for search/sort and legacy rows without this field.
     */
    startTimeEpochMs: v.optional(v.number()),
    durationSeconds: v.number(),
    userId: v.id("users"),
    budgetType: v.union(v.literal("ACTUAL"), v.literal("BUDGETED")),
    activityType: v.union(
      v.literal("TASK"),
      v.literal("EVENT"),
      v.literal("TRACKABLE")
    ),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    /**
     * Optional direct link to a list. When present (and the row is not
     * a TASK — task events derive list from `task.listId`), the list
     * name is the second priority in the title-derivation ladder
     * (explicit title → list name → trackable name → fallback).
     */
    listId: v.optional(v.id("lists")),
    /**
     * Persisted user-entered title. Distinguished semantically:
     *   - `undefined`  → no explicit title; render derived name from
     *                    list / trackable / task.
     *   - non-empty    → explicit user title; survives entity renames.
     *
     * The `upsert` mutation coerces empty/whitespace input to
     * `undefined` so "user cleared the field" reverts to derived
     * behaviour.
     */
    title: v.optional(v.string()),
    comments: v.optional(v.string()),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.string(),
    recurringEventId: v.optional(v.id("recurringEvents")),
    isRecurringInstance: v.boolean(),
    /**
     * Origin of the time window. Mirrors productivity-one's `source` field.
     *
     *  - `"timer"`            → created by `timers.finalizeTimer`
     *  - `"manual"`           → created/updated by `tasks.setTimeSpent` to
     *                            persist a manually-entered task duration
     *  - `"calendar"`         → created by drag-onto-calendar in CalendarView
     *  - `"tracker_entry"`    → reserved for future tracker-only entries
     *
     * Old rows written before this field existed will be `undefined`; treat
     * `undefined` as `"timer"` for backwards compatibility.
     */
    source: v.optional(
      v.union(
        v.literal("timer"),
        v.literal("manual"),
        v.literal("calendar"),
        v.literal("tracker_entry")
      )
    ),
    legacyId: v.optional(v.string()),
  })
    .index("by_user_day", ["userId", "startDayYYYYMMDD"])
    .index("by_task", ["taskId"])
    .index("by_trackable", ["trackableId"])
    .index("by_list", ["listId"])
    .index("by_user", ["userId"])
    .index("by_recurring_event", ["recurringEventId"])
    .index("by_legacy", ["legacyId"]),

  taskTimers: defineTable({
    userId: v.id("users"),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    timeZone: v.string(),
    startTime: v.number(),
    /**
     * Long-running-timer check-ins: highest elapsed-ms checkpoint (2h, 4h,
     * ... 22h) the user confirmed "yes, still working" for. The client
     * shows the check-in popup whenever the elapsed time crosses a
     * checkpoint above this value. Absent (0) until the first Yes.
     */
    acknowledgedUpToMs: v.optional(v.number()),
    /**
     * Legacy anchor fields from an earlier timer pipeline; no longer written.
     * Cleared on `timers.adjust`. Wall clock for UI + persistence is derived
     * only from `startTime` + `timeZone`.
     */
    calendarStartDayYYYYMMDD: v.optional(v.string()),
    calendarStartTimeHHMM: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  /**
   * A timer that hit the 24h cap and was auto-stopped by the
   * `autoStopLongTimers` cron WITHOUT logging any time. The elapsed
   * period is held here for review: next time the user opens the app,
   * the check-in gate shows the duration screen so they decide what
   * (if anything) to log. Resolved rows are deleted.
   */
  pendingTimerReviews: defineTable({
    userId: v.id("users"),
    taskId: v.optional(v.id("tasks")),
    trackableId: v.optional(v.id("trackables")),
    timeZone: v.string(),
    /** Original timer start (epoch ms). */
    startTime: v.number(),
    /** When the cron auto-stopped it (epoch ms). */
    stoppedAtMs: v.number(),
    /** Display name snapshot so the review screen has a title even if the task/trackable was renamed/deleted. */
    displayTitle: v.optional(v.string()),
    /** Carried over from the timer for duration pre-fill. */
    acknowledgedUpToMs: v.optional(v.number()),
  }).index("by_user", ["userId"]),

  trackables: defineTable({
    name: v.string(),
    colour: v.string(),
    trackableType: v.union(
      v.literal("NUMBER"),
      v.literal("TIME_TRACK"),
      v.literal("DAYS_A_WEEK"),
      v.literal("MINUTES_A_WEEK"),
      v.literal("TRACKER")
    ),
    frequency: v.optional(
      v.union(
        v.literal("DAILY"),
        v.literal("WEEKLY"),
        v.literal("MONTHLY")
      )
    ),
    targetNumberOfHours: v.optional(v.number()),
    targetNumberOfDaysAWeek: v.optional(v.number()),
    targetNumberOfMinutesAWeek: v.optional(v.number()),
    targetNumberOfWeeks: v.optional(v.number()),
    targetCount: v.optional(v.number()),
    startDayYYYYMMDD: v.string(),
    endDayYYYYMMDD: v.string(),
    orderIndex: v.number(),
    userId: v.id("users"),
    listId: v.optional(v.id("lists")),
    goalReasons: v.optional(v.array(v.string())),
    willAcceptPenalty: v.optional(v.boolean()),
    willDonateToCharity: v.optional(v.boolean()),
    willSendMoneyToAFriend: v.optional(v.boolean()),
    willPostOnSocialMedia: v.optional(v.boolean()),
    willShaveHead: v.optional(v.boolean()),
    otherPenaltySelected: v.optional(v.boolean()),
    otherPenalties: v.optional(v.array(v.string())),
    sendMoneyFriendName: v.optional(v.string()),
    sendMoneyFriendAmount: v.optional(v.number()),
    donateMoneyCharityAmount: v.optional(v.number()),
    archived: v.boolean(),
    isCumulative: v.boolean(),
    trackTime: v.boolean(),
    trackCount: v.boolean(),
    autoCountFromCalendar: v.boolean(),
    isRatingTracker: v.boolean(),
    /**
     * Denormalized lifetime totals maintained by every writer that
     * mutates an attributed `timeWindows` row, a `trackableDays` row, or
     * a `trackerEntries` row. Lets `getGoalDetails` /
     * `getTrackableAnalyticsSeries` serve all-time numbers without
     * re-aggregating the user's full activity history on every reactive
     * fire — previously the single largest contributor to home-page
     * `Reads` bandwidth.
     *
     * Backfill: `_admin/backfillTrackableLifetime:runAll`. Until that
     * runs the readers fall back to the legacy aggregation path so the
     * UI stays correct.
     */
    /** Σ attributed window seconds + (for TRACKER) entry seconds. */
    lifetimeTotalSeconds: v.optional(v.number()),
    /** Count of attributed ACTUAL windows. */
    lifetimeCalendarCount: v.optional(v.number()),
    /** Σ trackableDays.numCompleted (does NOT include task-completion counts). */
    lifetimeStoredDayCount: v.optional(v.number()),
    /** Σ trackerEntries.countValue (TRACKER only). */
    lifetimeTrackerEntryCount: v.optional(v.number()),
    /** Σ trackerEntries.durationSeconds (TRACKER only). */
    lifetimeTrackerEntrySeconds: v.optional(v.number()),
    /** Count of trackerEntries rows (separate from countValue sum). */
    lifetimeTrackerEntryRowCount: v.optional(v.number()),
    /**
     * Σ "completed task contributes 1 day" attributions across all of the
     * user's tasks. Mirrors `buildCompletedTaskCountsByTrackableDay`
     * but maintained at write time so `getGoalDetails` can serve the
     * lifetime sum without scanning every task. Day-bucketed reads are
     * still served by a bounded `tasks.by_user_completed_day` scan.
     *
     * Maintained by `_helpers/trackableLifetime.onTaskCompletionAttribution`
     * called from `tasks.upsert` whenever a task's completion state
     * or trackable/list attribution changes.
     */
    lifetimeAttributedTaskDayCount: v.optional(v.number()),
    /**
     * Earliest day with any attributed activity (window / day / entry).
     * Drives the lifetime "per day" averages in `getGoalDetails`. When
     * undefined the reader falls back to `startDayYYYYMMDD`.
     */
    firstActivityDayYYYYMMDD: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_order", ["userId", "orderIndex"])
    .index("by_user_archived", ["userId", "archived"])
    .index("by_legacy", ["legacyId"]),

  trackableDays: defineTable({
    trackableId: v.id("trackables"),
    userId: v.id("users"),
    dayYYYYMMDD: v.string(),
    numCompleted: v.number(),
    /**
     * Σ completed tasks whose attribution resolves to this trackable on
     * this `dayYYYYMMDD`. Maintained by `onTaskCompletionAttribution`
     * in `_helpers/trackableLifetime` whenever a task's completion
     * state or trackable/list attribution changes.
     *
     * Lets `getGoalDetails` / `getTrackableAnalyticsSeries` compute
     * per-day counts (`weeklyDayCompletion`, `todayDayCount`,
     * `periodicOverallProgress` for `DAYS_A_WEEK`) from this small
     * table directly, without scanning every completed task in the
     * user's history — previously the largest remaining contributor
     * to home-page read bandwidth after the lifetime denormalization
     * pass.
     */
    attributedTaskCount: v.optional(v.number()),
    comments: v.string(),
    legacyId: v.optional(v.string()),
  })
    .index("by_trackable_day", ["trackableId", "dayYYYYMMDD"])
    .index("by_user_trackable", ["userId", "trackableId"])
    .index("by_trackable", ["trackableId"])
    .index("by_legacy", ["legacyId"]),

  trackerEntries: defineTable({
    trackableId: v.id("trackables"),
    userId: v.id("users"),
    dayYYYYMMDD: v.string(),
    countValue: v.optional(v.number()),
    durationSeconds: v.optional(v.number()),
    startTimeHHMM: v.optional(v.string()),
    comments: v.optional(v.string()),
    legacyId: v.optional(v.string()),
  })
    .index("by_trackable", ["trackableId"])
    .index("by_trackable_day", ["trackableId", "dayYYYYMMDD"])
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  listTrackableLinks: defineTable({
    listId: v.id("lists"),
    trackableId: v.id("trackables"),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_list", ["listId"])
    .index("by_trackable", ["trackableId"])
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  reviewQuestions: defineTable({
    userId: v.id("users"),
    questionText: v.string(),
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    orderIndex: v.number(),
    archived: v.boolean(),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_user_frequency", ["userId", "frequency"])
    .index("by_legacy", ["legacyId"]),

  reviewAnswers: defineTable({
    reviewQuestionId: v.id("reviewQuestions"),
    userId: v.id("users"),
    answerText: v.string(),
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    dayUnderReview: v.string(),
    legacyId: v.optional(v.string()),
  })
    .index("by_question", ["reviewQuestionId"])
    .index("by_user_frequency_day", ["userId", "frequency", "dayUnderReview"])
    .index("by_legacy", ["legacyId"]),

  taskComments: defineTable({
    taskId: v.id("tasks"),
    userId: v.id("users"),
    commentText: v.string(),
    legacyId: v.optional(v.string()),
  })
    .index("by_task", ["taskId"])
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  recurringTasks: defineTable({
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern: v.optional(
      v.union(
        v.literal("DAY_OF_MONTH"),
        v.literal("DAY_OF_WEEK")
      )
    ),
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
    sectionOrderIndex: v.number(),
    trackableId: v.optional(v.id("trackables")),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeEstimatedInSeconds: v.number(),
    /**
     * Inclusive YYYYMMDD bounds of the window `generateInstances` has
     * already materialized for this rule. Lets repeat calls for an
     * already-covered window skip the per-rule instance/skip-set reads
     * entirely (those reads were ~190 KB per home-screen mount). Cleared
     * by `updateRule` because a rule edit can change which occurrences
     * exist inside a previously covered window.
     */
    materializedFromYYYYMMDD: v.optional(v.string()),
    materializedThroughYYYYMMDD: v.optional(v.string()),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_list", ["listId"])
    .index("by_legacy", ["legacyId"]),

  deletedRecurringOccurrences: defineTable({
    recurringTaskId: v.id("recurringTasks"),
    deletedDateYYYYMMDD: v.string(),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_recurring_task", ["recurringTaskId"])
    .index("by_recurring_date", ["recurringTaskId", "deletedDateYYYYMMDD"])
    .index("by_legacy", ["legacyId"]),

  recurringEvents: defineTable({
    frequency: v.union(
      v.literal("DAILY"),
      v.literal("WEEKLY"),
      v.literal("MONTHLY"),
      v.literal("YEARLY")
    ),
    interval: v.number(),
    daysOfWeek: v.optional(v.array(v.number())),
    monthlyPattern: v.optional(
      v.union(
        v.literal("DAY_OF_MONTH"),
        v.literal("DAY_OF_WEEK")
      )
    ),
    dayOfMonth: v.optional(v.number()),
    weekOfMonth: v.optional(v.number()),
    dayOfWeekMonthly: v.optional(v.number()),
    monthOfYear: v.optional(v.number()),
    startDateYYYYMMDD: v.string(),
    endDateYYYYMMDD: v.optional(v.string()),
    title: v.optional(v.string()),
    startTimeHHMM: v.string(),
    durationSeconds: v.number(),
    comments: v.optional(v.string()),
    trackableId: v.optional(v.id("trackables")),
    tagIds: v.optional(v.array(v.id("tags"))),
    timeZone: v.string(),
    budgetType: v.union(v.literal("ACTUAL"), v.literal("BUDGETED")),
    activityType: v.union(
      v.literal("TASK"),
      v.literal("EVENT"),
      v.literal("TRACKABLE")
    ),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_user", ["userId"])
    .index("by_legacy", ["legacyId"]),

  deletedRecurringEventOccurrences: defineTable({
    recurringEventId: v.id("recurringEvents"),
    deletedDateYYYYMMDD: v.string(),
    userId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_recurring_event", ["recurringEventId"])
    .index("by_recurring_date", [
      "recurringEventId",
      "deletedDateYYYYMMDD",
    ])
    .index("by_legacy", ["legacyId"]),

  trackableShares: defineTable({
    trackableId: v.id("trackables"),
    sharedWithUserId: v.id("users"),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("ACCEPTED"),
      v.literal("REJECTED")
    ),
    legacyId: v.optional(v.string()),
  })
    .index("by_trackable", ["trackableId"])
    .index("by_shared_user", ["sharedWithUserId"])
    .index("by_shared_user_status", ["sharedWithUserId", "status"])
    .index("by_legacy", ["legacyId"]),

  listShares: defineTable({
    listId: v.id("lists"),
    sharedWithUserId: v.id("users"),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
    status: v.union(
      v.literal("PENDING"),
      v.literal("ACCEPTED"),
      v.literal("REJECTED")
    ),
    legacyId: v.optional(v.string()),
  })
    .index("by_list", ["listId"])
    .index("by_shared_user", ["sharedWithUserId"])
    .index("by_shared_user_status", ["sharedWithUserId", "status"])
    .index("by_legacy", ["legacyId"]),

  pendingListInvites: defineTable({
    listId: v.id("lists"),
    invitedEmail: v.string(),
    permission: v.union(v.literal("VIEWER"), v.literal("EDITOR")),
    invitedByUserId: v.id("users"),
    legacyId: v.optional(v.string()),
  })
    .index("by_list", ["listId"])
    .index("by_email", ["invitedEmail"])
    .index("by_legacy", ["legacyId"]),

  pushTokens: defineTable({
    userId: v.id("users"),
    token: v.string(),
    platform: v.union(
      v.literal("ios"),
      v.literal("android"),
      v.literal("web")
    ),
  })
    .index("by_user", ["userId"])
    .index("by_token", ["token"]),
});
