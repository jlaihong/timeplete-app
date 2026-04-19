/**
 * One-shot extract step of the productivity-app -> timeplete migration.
 *
 * Reads from the local PostgreSQL `timeplete_migration` database (which
 * holds the restored Supabase dump) and writes one JSONL file per Convex
 * table into `scripts/migration/migration-out/`.
 *
 * Each row in a JSONL file has its fields named in the Convex camelCase
 * convention. Foreign key fields still hold the original Postgres UUID as
 * a string (NOT a Convex `_id`); the loader script resolves these at
 * import time using the `legacyId -> Convex _id` map it builds as it goes.
 *
 * Run via:
 *   cd timeplete-app
 *   npx tsx scripts/migration/extract.ts
 */
import { Client } from "pg";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const OUT_DIR = join(__dirname, "migration-out");

const PG_CONFIG = {
  host: "127.0.0.1",
  port: 5432,
  user: "myuser",
  password: "mypassword",
  database: "timeplete_migration",
};

/**
 * Helper: write rows as one JSON object per line. We use JSONL instead of a
 * single JSON array so the loader can stream-process large tables (e.g.
 * `time_windows` with 1572 rows, `tasks` with 705 rows).
 */
function writeJsonl(file: string, rows: unknown[]) {
  const out = rows.map((r) => JSON.stringify(r)).join("\n");
  writeFileSync(join(OUT_DIR, file), out + (out ? "\n" : ""), "utf8");
  console.log(`  wrote ${rows.length} rows -> ${file}`);
}

/** Convert PG `bool` -> JS boolean, with explicit null handling. */
const b = (v: unknown): boolean => v === true || v === "t" || v === true;

/** Trackable type + frequency mapping (see migration-out/inventory.md). */
function mapTrackableType(
  pgType: string,
  pgFreq: string | null,
): "NUMBER" | "TIME_TRACK" | "DAYS_A_WEEK" | "MINUTES_A_WEEK" | "TRACKER" {
  if (pgType === "TRACKER") return "TRACKER";
  if (pgType === "COUNT") return "NUMBER";
  if (pgType === "TIME_TRACK") return "TIME_TRACK";
  if (pgType === "PERIODIC" || pgType === "READING") {
    if (pgFreq === "COUPLE_MINUTES_A_WEEK") return "MINUTES_A_WEEK";
    return "DAYS_A_WEEK";
  }
  throw new Error(`Unknown trackable type/freq: ${pgType}/${pgFreq}`);
}

/** time_windows.budget_type: PG `PLANNED` -> Convex `BUDGETED`. */
function mapBudgetType(pg: string): "ACTUAL" | "BUDGETED" {
  if (pg === "ACTUAL") return "ACTUAL";
  if (pg === "PLANNED") return "BUDGETED";
  throw new Error(`Unknown budget_type: ${pg}`);
}

/**
 * Postgres `start_day_yyyymmdd` (and friends) are stored as `YYYY-MM-DD`
 * date strings, but the Convex schema and every consumer compares them
 * lexicographically against `YYYYMMDD` (no dashes — see `lib/dates.ts`'s
 * `formatYYYYMMDD`). Without this conversion every per-day analytics
 * filter (`w.startDayYYYYMMDD === day`) silently misses, leaving weekly
 * /monthly/yearly stats stuck at zero even though the lifetime totals
 * (which don't compare dates) look right. Returns `undefined` for
 * `null`/`undefined`/empty input so optional fields stay optional.
 */
function ymd(s: string | null | undefined): string | undefined {
  if (s === null || s === undefined) return undefined;
  if (typeof s !== "string" || s.length === 0) return undefined;
  return s.replace(/-/g, "");
}

/** Share permission: PG lowercase -> Convex uppercase. */
function mapPermission(pg: string): "VIEWER" | "EDITOR" {
  if (pg === "viewer") return "VIEWER";
  if (pg === "editor") return "EDITOR";
  throw new Error(`Unknown share permission: ${pg}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const client = new Client(PG_CONFIG);
  await client.connect();
  console.log("Connected to Postgres");

  // --- USERS (approved only) ---
  const userRes = await client.query(
    `SELECT id, email, name FROM public.users WHERE is_approved = true ORDER BY created_at`,
  );
  const userIds = userRes.rows.map((r) => r.id as string);
  console.log(`Approved users: ${userIds.length}`);

  writeJsonl(
    "users.jsonl",
    userRes.rows.map((r) => ({
      legacyId: r.id,
      email: r.email,
      name: r.name ?? r.email,
      isApproved: true,
    })),
  );

  // Restrict every subsequent table to rows whose user_id is in `userIds`.
  // Pass the array as a typed parameter so PG handles the IN-list cleanly.
  const userIdParam = userIds;
  const inUsers = `WHERE user_id = ANY($1::uuid[])`;

  // --- TAGS ---
  const tags = await client.query(
    `SELECT id, name, colour, order_index, user_id, COALESCE(archived, false) AS archived
     FROM public.tags ${inUsers} ORDER BY order_index`,
    [userIdParam],
  );
  writeJsonl(
    "tags.jsonl",
    tags.rows.map((r) => ({
      legacyId: r.id,
      name: r.name,
      colour: r.colour,
      orderIndex: r.order_index,
      userId: r.user_id,
      archived: b(r.archived),
    })),
  );

  // --- LISTS ---
  const lists = await client.query(
    `SELECT id, name, colour, order_index, user_id, COALESCE(archived,false) AS archived,
            COALESCE(is_goal_list,false) AS is_goal_list,
            COALESCE(show_in_sidebar,true) AS show_in_sidebar,
            COALESCE(is_inbox,false) AS is_inbox
     FROM public.lists ${inUsers} ORDER BY order_index`,
    [userIdParam],
  );
  writeJsonl(
    "lists.jsonl",
    lists.rows.map((r) => ({
      legacyId: r.id,
      name: r.name,
      colour: r.colour,
      orderIndex: r.order_index,
      userId: r.user_id,
      archived: b(r.archived),
      isGoalList: b(r.is_goal_list),
      showInSidebar: b(r.show_in_sidebar),
      isInbox: b(r.is_inbox),
    })),
  );

  // --- LIST SECTIONS ---
  const sections = await client.query(
    `SELECT id, list_id, name, order_index,
            COALESCE(is_default_section,false) AS is_default_section, user_id
     FROM public.list_sections ${inUsers} ORDER BY order_index`,
    [userIdParam],
  );
  writeJsonl(
    "listSections.jsonl",
    sections.rows.map((r) => ({
      legacyId: r.id,
      listId: r.list_id,
      name: r.name,
      orderIndex: r.order_index,
      isDefaultSection: b(r.is_default_section),
      userId: r.user_id,
    })),
  );

  // --- TRACKABLES ---
  const trackables = await client.query(
    `SELECT id, name, colour, trackable_type, frequency,
            target_number_of_hours, target_number_of_days_a_week,
            target_number_of_minutes_a_week, target_number_of_weeks, target_count,
            start_day_yyyymmdd, end_day_yyyymmdd, order_index, user_id, list_id,
            goal_reasons,
            will_accept_penalty, will_donate_to_charity, will_send_money_to_a_friend,
            will_post_on_social_media, will_shave_head, other_penalty_selected,
            other_penalties, send_money_friend_name, send_money_friend_amount,
            donate_money_charity_amount,
            COALESCE(archived,false) AS archived,
            COALESCE(is_cumulative,false) AS is_cumulative,
            COALESCE(track_time,false) AS track_time,
            COALESCE(track_count,false) AS track_count,
            COALESCE(auto_count_from_calendar,false) AS auto_count_from_calendar,
            COALESCE(is_rating_tracker,false) AS is_rating_tracker
     FROM public.trackables ${inUsers} ORDER BY order_index`,
    [userIdParam],
  );
  writeJsonl(
    "trackables.jsonl",
    trackables.rows.map((r) => ({
      legacyId: r.id,
      name: r.name,
      colour: r.colour,
      trackableType: mapTrackableType(r.trackable_type, r.frequency),
      targetNumberOfHours: r.target_number_of_hours ?? undefined,
      targetNumberOfDaysAWeek: r.target_number_of_days_a_week ?? undefined,
      targetNumberOfMinutesAWeek: r.target_number_of_minutes_a_week ?? undefined,
      targetNumberOfWeeks: r.target_number_of_weeks ?? undefined,
      targetCount: r.target_count ?? undefined,
      startDayYYYYMMDD: ymd(r.start_day_yyyymmdd) ?? "",
      endDayYYYYMMDD: ymd(r.end_day_yyyymmdd) ?? "",
      orderIndex: r.order_index,
      userId: r.user_id,
      listId: r.list_id ?? undefined,
      goalReasons: r.goal_reasons ?? undefined,
      willAcceptPenalty: r.will_accept_penalty ?? undefined,
      willDonateToCharity: r.will_donate_to_charity ?? undefined,
      willSendMoneyToAFriend: r.will_send_money_to_a_friend ?? undefined,
      willPostOnSocialMedia: r.will_post_on_social_media ?? undefined,
      willShaveHead: r.will_shave_head ?? undefined,
      otherPenaltySelected: r.other_penalty_selected ?? undefined,
      otherPenalties: r.other_penalties ?? undefined,
      sendMoneyFriendName: r.send_money_friend_name ?? undefined,
      sendMoneyFriendAmount:
        r.send_money_friend_amount != null
          ? Number(r.send_money_friend_amount)
          : undefined,
      donateMoneyCharityAmount:
        r.donate_money_charity_amount != null
          ? Number(r.donate_money_charity_amount)
          : undefined,
      archived: b(r.archived),
      isCumulative: b(r.is_cumulative),
      trackTime: b(r.track_time),
      trackCount: b(r.track_count),
      autoCountFromCalendar: b(r.auto_count_from_calendar),
      isRatingTracker: b(r.is_rating_tracker),
    })),
  );

  // --- RECURRING TASKS (no FK to tasks; tasks reference back) ---
  const recTasks = await client.query(
    `SELECT id, frequency, interval, days_of_week, monthly_pattern,
            day_of_month, week_of_month, day_of_week_monthly, month_of_year,
            start_date_yyyymmdd, end_date_yyyymmdd, start_time_hhmm, end_time_hhmm,
            name, list_id, section_id, COALESCE(section_order_index,0) AS section_order_index,
            trackable_id, tag_ids, COALESCE(time_estimated_in_seconds,0) AS time_estimated_in_seconds,
            user_id
     FROM public.recurring_tasks ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "recurringTasks.jsonl",
    recTasks.rows.map((r) => ({
      legacyId: r.id,
      frequency: r.frequency,
      interval: r.interval,
      daysOfWeek: r.days_of_week ?? undefined,
      monthlyPattern: r.monthly_pattern ?? undefined,
      dayOfMonth: r.day_of_month ?? undefined,
      weekOfMonth: r.week_of_month ?? undefined,
      dayOfWeekMonthly: r.day_of_week_monthly ?? undefined,
      monthOfYear: r.month_of_year ?? undefined,
      startDateYYYYMMDD: ymd(r.start_date_yyyymmdd) ?? "",
      endDateYYYYMMDD: ymd(r.end_date_yyyymmdd),
      startTimeHHMM: r.start_time_hhmm ?? undefined,
      endTimeHHMM: r.end_time_hhmm ?? undefined,
      name: r.name,
      listId: r.list_id ?? undefined,
      sectionId: r.section_id ?? undefined,
      sectionOrderIndex: r.section_order_index,
      trackableId: r.trackable_id ?? undefined,
      tagIds: r.tag_ids ?? undefined,
      timeEstimatedInSeconds: r.time_estimated_in_seconds,
      userId: r.user_id,
    })),
  );

  // --- RECURRING EVENTS ---
  const recEvents = await client.query(
    `SELECT id, frequency, interval, days_of_week, monthly_pattern,
            day_of_month, week_of_month, day_of_week_monthly, month_of_year,
            start_date_yyyymmdd, end_date_yyyymmdd, title, start_time_hhmm,
            COALESCE(duration_seconds,0) AS duration_seconds, comments,
            trackable_id, tag_ids, time_zone, budget_type, activity_type, user_id
     FROM public.recurring_events ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "recurringEvents.jsonl",
    recEvents.rows.map((r) => ({
      legacyId: r.id,
      frequency: r.frequency,
      interval: r.interval,
      daysOfWeek: r.days_of_week ?? undefined,
      monthlyPattern: r.monthly_pattern ?? undefined,
      dayOfMonth: r.day_of_month ?? undefined,
      weekOfMonth: r.week_of_month ?? undefined,
      dayOfWeekMonthly: r.day_of_week_monthly ?? undefined,
      monthOfYear: r.month_of_year ?? undefined,
      startDateYYYYMMDD: ymd(r.start_date_yyyymmdd) ?? "",
      endDateYYYYMMDD: ymd(r.end_date_yyyymmdd),
      title: r.title ?? undefined,
      startTimeHHMM: r.start_time_hhmm,
      durationSeconds: r.duration_seconds,
      comments: r.comments ?? undefined,
      trackableId: r.trackable_id ?? undefined,
      tagIds: r.tag_ids ?? undefined,
      timeZone: r.time_zone ?? "UTC",
      budgetType: mapBudgetType(r.budget_type),
      activityType: r.activity_type,
      userId: r.user_id,
    })),
  );

  // --- TASKS ---
  // We extract everything in one go; the loader uses two passes to handle
  // the parent_id / root_task_id self-references (insert all tasks with
  // parent/root undefined, then patch them once the legacyId map is built).
  const tasks = await client.query(
    `SELECT id, root_task_id, name, parent_id, date_completed,
            COALESCE(time_spent_in_seconds_unallocated,0) AS time_spent_in_seconds_unallocated,
            COALESCE(time_estimated_in_seconds_unallocated,0) AS time_estimated_in_seconds_unallocated,
            due_date_yyyymmdd, list_id, task_day,
            COALESCE(task_day_order_index,0) AS task_day_order_index,
            section_id, COALESCE(section_order_index,0) AS section_order_index,
            trackable_id, recurring_task_id,
            COALESCE(is_recurring_instance,false) AS is_recurring_instance,
            user_id, created_by, assigned_to_user_id
     FROM public.tasks ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "tasks.jsonl",
    tasks.rows.map((r) => {
      // Postgres `date_completed` is a varchar in the dump; in practice it
      // holds either NULL or an ISO YYYY-MM-DD string. Defensive: drop the
      // value if it accidentally contains the literal "false" / "FALSE"
      // that an old DEFAULT clause might have produced.
      let dateCompleted: string | undefined =
        typeof r.date_completed === "string"
          ? r.date_completed
          : r.date_completed == null
            ? undefined
            : String(r.date_completed);
      if (
        dateCompleted &&
        ["false", "FALSE", "f"].includes(dateCompleted.toLowerCase())
      ) {
        dateCompleted = undefined;
      }
      return {
        legacyId: r.id,
        name: r.name,
        parentId: r.parent_id ?? undefined,
        rootTaskId: r.root_task_id ?? undefined,
        dateCompleted: ymd(dateCompleted),
        timeSpentInSecondsUnallocated: r.time_spent_in_seconds_unallocated,
        timeEstimatedInSecondsUnallocated: r.time_estimated_in_seconds_unallocated,
        dueDateYYYYMMDD: ymd(r.due_date_yyyymmdd),
        listId: r.list_id ?? undefined,
        taskDay: ymd(r.task_day),
        taskDayOrderIndex: r.task_day_order_index,
        sectionId: r.section_id ?? undefined,
        sectionOrderIndex: r.section_order_index,
        trackableId: r.trackable_id ?? undefined,
        recurringTaskId: r.recurring_task_id ?? undefined,
        isRecurringInstance: b(r.is_recurring_instance),
        userId: r.user_id,
        createdBy: r.created_by ?? r.user_id,
        assignedToUserId: r.assigned_to_user_id ?? undefined,
      };
    }),
  );

  // --- TASK-TAG join (auto legacyId since PG uses composite PK) ---
  const taskTags = await client.query(
    `SELECT tt.task_id, tt.tag_id
     FROM public.task_tags tt
     JOIN public.tasks t ON t.id = tt.task_id
     WHERE t.user_id = ANY($1::uuid[])`,
    [userIdParam],
  );
  writeJsonl(
    "taskTags.jsonl",
    taskTags.rows.map((r) => ({
      legacyId: `${r.task_id}:${r.tag_id}`,
      taskId: r.task_id,
      tagId: r.tag_id,
    })),
  );

  // --- TASK DAYS (PK = user_id, day_yyyymmdd, task_id) ---
  const taskDays = await client.query(
    `SELECT user_id, day_yyyymmdd, task_id, COALESCE(order_index,0) AS order_index
     FROM public.task_days ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "taskDays.jsonl",
    taskDays.rows.map((r) => ({
      legacyId: `${r.user_id}:${r.day_yyyymmdd}:${r.task_id}`,
      userId: r.user_id,
      dayYYYYMMDD: ymd(r.day_yyyymmdd) ?? "",
      taskId: r.task_id,
      orderIndex: r.order_index,
    })),
  );

  // --- USER TASK DAY ORDER (composite PK) ---
  const utdo = await client.query(
    `SELECT user_id, task_id, task_day, COALESCE(order_index,0) AS order_index
     FROM public.user_task_day_order ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "userTaskDayOrder.jsonl",
    utdo.rows.map((r) => ({
      legacyId: `${r.user_id}:${r.task_id}:${r.task_day}`,
      userId: r.user_id,
      taskId: r.task_id,
      taskDay: ymd(r.task_day) ?? "",
      orderIndex: r.order_index,
    })),
  );

  // --- TASK LIST ORDERING (composite PK) ---
  const tlo = await client.query(
    `SELECT user_id, list_id, task_id, COALESCE(order_index,0) AS order_index
     FROM public.task_list_ordering ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "taskListOrdering.jsonl",
    tlo.rows.map((r) => ({
      legacyId: `${r.user_id}:${r.list_id}:${r.task_id}`,
      userId: r.user_id,
      listId: r.list_id,
      taskId: r.task_id,
      orderIndex: r.order_index,
    })),
  );

  // --- ROOT TASK ORDERING (composite PK) ---
  const rto = await client.query(
    `SELECT user_id, root_task_id, task_id, COALESCE(order_index,0) AS order_index
     FROM public.root_task_ordering ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "rootTaskOrdering.jsonl",
    rto.rows.map((r) => ({
      legacyId: `${r.user_id}:${r.root_task_id}:${r.task_id}`,
      userId: r.user_id,
      rootTaskId: r.root_task_id,
      taskId: r.task_id,
      orderIndex: r.order_index,
    })),
  );

  // --- TASK COMMENTS ---
  const taskComments = await client.query(
    `SELECT id, task_id, user_id, comment_text
     FROM public.task_comments ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "taskComments.jsonl",
    taskComments.rows.map((r) => ({
      legacyId: r.id,
      taskId: r.task_id,
      userId: r.user_id,
      commentText: r.comment_text,
    })),
  );

  // --- TASK TIMERS (PK = user_id; only 2 rows total) ---
  const taskTimers = await client.query(
    `SELECT user_id, task_id, trackable_id, time_zone,
            EXTRACT(EPOCH FROM start_time) * 1000 AS start_time_ms
     FROM public.task_timers ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "taskTimers.jsonl",
    taskTimers.rows.map((r) => ({
      legacyId: r.user_id,
      userId: r.user_id,
      taskId: r.task_id ?? undefined,
      trackableId: r.trackable_id ?? undefined,
      timeZone: r.time_zone ?? "UTC",
      startTime: Number(r.start_time_ms),
    })),
  );

  // --- TIME WINDOWS ---
  // Note: `source` is a Convex-side field that didn't exist in PG; leave it
  // undefined for migrated rows so the app's backwards-compat treats them
  // as `"timer"` (see schema.ts comment on `timeWindows.source`).
  const timeWindows = await client.query(
    `SELECT id, start_time_hhmm, start_day_yyyymmdd,
            COALESCE(duration_seconds,0) AS duration_seconds, user_id,
            budget_type, activity_type, task_id, trackable_id, title, comments,
            tag_ids, time_zone, recurring_event_id,
            COALESCE(is_recurring_instance,false) AS is_recurring_instance
     FROM public.time_windows ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "timeWindows.jsonl",
    timeWindows.rows.map((r) => ({
      legacyId: r.id,
      startTimeHHMM: r.start_time_hhmm,
      startDayYYYYMMDD: ymd(r.start_day_yyyymmdd) ?? "",
      durationSeconds: r.duration_seconds,
      userId: r.user_id,
      budgetType: mapBudgetType(r.budget_type),
      activityType: r.activity_type,
      taskId: r.task_id ?? undefined,
      trackableId: r.trackable_id ?? undefined,
      title: r.title ?? undefined,
      comments: r.comments ?? undefined,
      tagIds: r.tag_ids ?? undefined,
      timeZone: r.time_zone ?? "UTC",
      recurringEventId: r.recurring_event_id ?? undefined,
      isRecurringInstance: b(r.is_recurring_instance),
    })),
  );

  // --- TRACKABLE DAYS (no id; composite key trackable_id + day) ---
  const td = await client.query(
    `SELECT trackable_id, user_id, day_yyyymmdd,
            COALESCE(num_completed,0) AS num_completed,
            COALESCE(comments,'') AS comments
     FROM public.trackable_days ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "trackableDays.jsonl",
    td.rows.map((r) => ({
      legacyId: `${r.trackable_id}:${r.day_yyyymmdd}`,
      trackableId: r.trackable_id,
      userId: r.user_id,
      dayYYYYMMDD: ymd(r.day_yyyymmdd) ?? "",
      numCompleted: Number(r.num_completed),
      comments: r.comments ?? "",
    })),
  );

  // --- TRACKER ENTRIES ---
  const te = await client.query(
    `SELECT id, trackable_id, user_id, day_yyyymmdd,
            count_value, duration_seconds, start_time_hhmm, comments
     FROM public.tracker_entries ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "trackerEntries.jsonl",
    te.rows.map((r) => ({
      legacyId: r.id,
      trackableId: r.trackable_id,
      userId: r.user_id,
      dayYYYYMMDD: ymd(r.day_yyyymmdd) ?? "",
      countValue: r.count_value != null ? Number(r.count_value) : undefined,
      durationSeconds:
        r.duration_seconds != null ? Number(r.duration_seconds) : undefined,
      startTimeHHMM: r.start_time_hhmm ?? undefined,
      comments: r.comments ?? undefined,
    })),
  );

  // --- LIST <-> TRACKABLE LINKS ---
  const ltl = await client.query(
    `SELECT id, list_id, trackable_id, user_id
     FROM public.list_trackable_links ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "listTrackableLinks.jsonl",
    ltl.rows.map((r) => ({
      legacyId: r.id,
      listId: r.list_id,
      trackableId: r.trackable_id,
      userId: r.user_id,
    })),
  );

  // --- DELETED RECURRING (TASK) OCCURRENCES (no id) ---
  const dro = await client.query(
    `SELECT recurring_task_id, deleted_date_yyyymmdd, user_id
     FROM public.deleted_recurring_occurrences ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "deletedRecurringOccurrences.jsonl",
    dro.rows.map((r) => ({
      legacyId: `${r.recurring_task_id}:${r.deleted_date_yyyymmdd}`,
      recurringTaskId: r.recurring_task_id,
      deletedDateYYYYMMDD: ymd(r.deleted_date_yyyymmdd) ?? "",
      userId: r.user_id,
    })),
  );

  // --- DELETED RECURRING EVENT OCCURRENCES (no id) ---
  const dreo = await client.query(
    `SELECT recurring_event_id, deleted_date_yyyymmdd, user_id
     FROM public.deleted_recurring_event_occurrences ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "deletedRecurringEventOccurrences.jsonl",
    dreo.rows.map((r) => ({
      legacyId: `${r.recurring_event_id}:${r.deleted_date_yyyymmdd}`,
      recurringEventId: r.recurring_event_id,
      deletedDateYYYYMMDD: ymd(r.deleted_date_yyyymmdd) ?? "",
      userId: r.user_id,
    })),
  );

  // --- TRACKABLE SHARES ---
  // PG `trackable_shares` doesn't carry an explicit owner column; the
  // owner is the trackable's `user_id`. We require both the owner AND the
  // recipient to be in our approved-user set so the resulting Convex row
  // is wired to two real `users._id`s.
  const trShares = await client.query(
    `SELECT ts.id, ts.trackable_id, ts.shared_with_user_id, ts.permission, ts.status
     FROM public.trackable_shares ts
     JOIN public.trackables t ON t.id = ts.trackable_id
     WHERE t.user_id = ANY($1::uuid[])
       AND ts.shared_with_user_id = ANY($1::uuid[])`,
    [userIdParam],
  );
  writeJsonl(
    "trackableShares.jsonl",
    trShares.rows.map((r) => ({
      legacyId: r.id,
      trackableId: r.trackable_id,
      sharedWithUserId: r.shared_with_user_id,
      permission: mapPermission(r.permission),
      status: (r.status ?? "PENDING").toUpperCase(),
    })),
  );

  // --- LIST SHARES (same rationale as trackable_shares above) ---
  const lShares = await client.query(
    `SELECT ls.id, ls.list_id, ls.shared_with_user_id, ls.permission, ls.status
     FROM public.list_shares ls
     JOIN public.lists l ON l.id = ls.list_id
     WHERE l.user_id = ANY($1::uuid[])
       AND ls.shared_with_user_id = ANY($1::uuid[])`,
    [userIdParam],
  );
  writeJsonl(
    "listShares.jsonl",
    lShares.rows.map((r) => ({
      legacyId: r.id,
      listId: r.list_id,
      sharedWithUserId: r.shared_with_user_id,
      permission: mapPermission(r.permission),
      status: (r.status ?? "PENDING").toUpperCase(),
    })),
  );

  // --- PENDING LIST INVITES ---
  const pli = await client.query(
    `SELECT id, list_id, invited_email, permission, invited_by_user_id AS user_id
     FROM public.pending_list_invites
     WHERE invited_by_user_id = ANY($1::uuid[])`,
    [userIdParam],
  );
  writeJsonl(
    "pendingListInvites.jsonl",
    pli.rows.map((r) => ({
      legacyId: r.id,
      listId: r.list_id,
      invitedEmail: r.invited_email,
      permission: mapPermission(r.permission),
      invitedByUserId: r.user_id,
    })),
  );

  // --- REVIEW QUESTIONS ---
  const rq = await client.query(
    `SELECT id, user_id, question_text, frequency,
            COALESCE(order_index,0) AS order_index,
            COALESCE(archived,false) AS archived
     FROM public.review_questions ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "reviewQuestions.jsonl",
    rq.rows.map((r) => ({
      legacyId: r.id,
      userId: r.user_id,
      questionText: r.question_text,
      frequency: r.frequency,
      orderIndex: r.order_index,
      archived: b(r.archived),
    })),
  );

  // --- REVIEW ANSWERS ---
  const ra = await client.query(
    `SELECT id, review_question_id, user_id, answer_text, frequency, day_under_review
     FROM public.review_answers ${inUsers}`,
    [userIdParam],
  );
  writeJsonl(
    "reviewAnswers.jsonl",
    ra.rows.map((r) => ({
      legacyId: r.id,
      reviewQuestionId: r.review_question_id,
      userId: r.user_id,
      answerText: r.answer_text,
      frequency: r.frequency,
      dayUnderReview: ymd(r.day_under_review) ?? "",
    })),
  );

  await client.end();
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
