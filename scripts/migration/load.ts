/**
 * One-shot load step of the productivity-app -> timeplete migration.
 *
 * Reads the JSONL files produced by `extract.ts` from
 * `scripts/migration/migration-out/` and pushes them into the local
 * Convex backend by calling the `internalMutation`s in
 * `convex/_admin/import.ts`.
 *
 * The script is fully idempotent — every importer keys off `legacyId`,
 * so re-running this on top of a half-finished load picks up where the
 * previous attempt stopped.
 *
 * Run via:
 *   cd timeplete-app
 *   npx tsx scripts/migration/load.ts
 *
 * Reads the local backend URL + admin key from
 * `.convex/local/default/config.json` (which `npx convex dev` maintains
 * for the project-local anonymous deployment).
 */
import { ConvexHttpClient } from "convex/browser";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { internal } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const IN_DIR = join(__dirname, "migration-out");

/**
 * Number of rows per `importBatch` HTTP call. Convex caps mutation arg
 * size around ~8 MB; 200 rows of typical task/timeWindow shape fits
 * comfortably under that with plenty of headroom.
 */
const BATCH_SIZE = 200;

/**
 * Load the local-deployment admin key and URL from the well-known
 * `.convex/local/default/config.json` that `npx convex dev` writes when
 * the anonymous deployment is initialised. We deliberately read this
 * directly rather than re-implementing convex CLI's resolution logic.
 */
function loadLocalDeploymentConfig(): { url: string; adminKey: string } {
  const configPath = join(
    __dirname,
    "..",
    "..",
    ".convex",
    "local",
    "default",
    "config.json",
  );
  if (!existsSync(configPath)) {
    throw new Error(
      `Missing local Convex config at ${configPath}. Run 'npx convex dev' once to initialise it.`,
    );
  }
  const config = JSON.parse(readFileSync(configPath, "utf8")) as {
    ports: { cloud: number };
    adminKey: string;
  };
  return {
    url: `http://127.0.0.1:${config.ports.cloud}`,
    adminKey: config.adminKey,
  };
}

function readJsonl<T>(file: string): T[] {
  const path = join(IN_DIR, file);
  if (!existsSync(path)) return [];
  const content = readFileSync(path, "utf8").trim();
  if (!content) return [];
  return content.split("\n").map((line) => JSON.parse(line) as T);
}

/**
 * `legacyId` (Postgres UUID, or a synthetic `:`-joined composite key) →
 * Convex `_id` for that row. Filled in as we load each table; later
 * tables look up their FKs here.
 */
type IdMap<T extends string> = Map<string, Id<T>>;

/**
 * In-place FK resolution. For every field name in `fkFields`, replace the
 * stored Postgres-UUID string with the Convex `_id` for that row, taken
 * from `map`. Rows whose FK can't be resolved (because the referenced
 * row was filtered out, e.g. an unapproved user) are returned in
 * `dropped` so the caller can log/skip them.
 *
 * Optional FK fields whose value is null/undefined are simply omitted
 * from the output row (Convex rejects `null` for `v.optional(...)`).
 */
function resolveFks<T extends Record<string, unknown>>(
  rows: T[],
  resolvers: Array<{
    field: keyof T;
    map: Map<string, string>;
    required: boolean;
  }>,
  arrayResolvers: Array<{
    field: keyof T;
    map: Map<string, string>;
  }> = [],
): { rows: T[]; dropped: number } {
  let dropped = 0;
  const out: T[] = [];
  outer: for (const row of rows) {
    const next: Record<string, unknown> = { ...row };
    for (const { field, map, required } of resolvers) {
      const raw = row[field];
      if (raw == null || raw === "") {
        if (required) {
          dropped++;
          continue outer;
        }
        delete next[field as string];
        continue;
      }
      const mapped = map.get(raw as string);
      if (!mapped) {
        if (required) {
          dropped++;
          continue outer;
        }
        delete next[field as string];
        continue;
      }
      next[field as string] = mapped;
    }
    for (const { field, map } of arrayResolvers) {
      const raw = row[field];
      if (raw == null) continue;
      const arr = raw as unknown[];
      const resolved: string[] = [];
      for (const item of arr) {
        const mapped = map.get(item as string);
        if (mapped) resolved.push(mapped);
      }
      if (resolved.length === 0) delete next[field as string];
      else next[field as string] = resolved;
    }
    out.push(next as T);
  }
  return { rows: out, dropped };
}

async function loadTable<T extends { legacyId: string }>(
  client: ConvexHttpClient,
  table: string,
  rows: T[],
): Promise<IdMap<string>> {
  const map: IdMap<string> = new Map();
  if (rows.length === 0) {
    console.log(`  ${table}: 0 rows (skip)`);
    return map;
  }
  let inserted = 0;
  let skipped = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const res = await client.mutation(internal._admin.import.importBatch, {
      table,
      rows: batch,
    });
    inserted += res.inserted;
    skipped += res.skipped;
    for (const m of res.mapping) {
      map.set(m.legacyId, m.id as Id<string>);
    }
  }
  console.log(
    `  ${table}: ${rows.length} rows (${inserted} inserted, ${skipped} already present)`,
  );
  return map;
}

type UserRow = {
  legacyId: string;
  email: string;
  name: string;
  isApproved: boolean;
};

async function loadUsers(
  client: ConvexHttpClient,
  rows: UserRow[],
): Promise<IdMap<"users">> {
  const map: IdMap<"users"> = new Map();
  for (const r of rows) {
    const id = await client.mutation(internal._admin.import.importUser, r);
    map.set(r.legacyId, id);
  }
  console.log(`  users: ${rows.length} rows imported (idempotent by legacyId)`);
  return map;
}

async function main() {
  const { url, adminKey } = loadLocalDeploymentConfig();
  console.log(`Connecting to local Convex at ${url}`);
  const client = new ConvexHttpClient(url);
  // setAdminAuth is technically @internal but is the only way to call
  // internalMutations from a Node script against a local deployment.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (client as any).setAdminAuth(adminKey);

  // ---- Users (must be first; everything else FK-references users) ----
  const userRows = readJsonl<UserRow>("users.jsonl");
  const usersMap = await loadUsers(client, userRows);

  // ---- Tags ----
  type TagRow = {
    legacyId: string;
    userId: string;
    name: string;
    colour: string;
    orderIndex: number;
    archived: boolean;
  };
  const tagsRaw = readJsonl<TagRow>("tags.jsonl");
  const tagsResolved = resolveFks(tagsRaw, [
    { field: "userId", map: usersMap, required: true },
  ]);
  if (tagsResolved.dropped) console.log(`    tags: dropped ${tagsResolved.dropped}`);
  const tagsMap = await loadTable(client, "tags", tagsResolved.rows);

  // ---- Lists ----
  type ListRow = {
    legacyId: string;
    userId: string;
    name: string;
    colour: string;
    orderIndex: number;
    archived: boolean;
    isGoalList: boolean;
    showInSidebar: boolean;
    isInbox: boolean;
  };
  const listsRaw = readJsonl<ListRow>("lists.jsonl");
  const listsResolved = resolveFks(listsRaw, [
    { field: "userId", map: usersMap, required: true },
  ]);
  if (listsResolved.dropped)
    console.log(`    lists: dropped ${listsResolved.dropped}`);
  const listsMap = await loadTable(client, "lists", listsResolved.rows);

  // ---- List sections ----
  type ListSectionRow = {
    legacyId: string;
    listId: string;
    userId: string;
    name: string;
    orderIndex: number;
    isDefaultSection: boolean;
  };
  const sectionsRaw = readJsonl<ListSectionRow>("listSections.jsonl");
  const sectionsResolved = resolveFks(sectionsRaw, [
    { field: "listId", map: listsMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (sectionsResolved.dropped)
    console.log(`    listSections: dropped ${sectionsResolved.dropped}`);
  const sectionsMap = await loadTable(
    client,
    "listSections",
    sectionsResolved.rows,
  );

  // ---- Trackables (no FK to tasks; used by recurring/tasks/timeWindows) ----
  type TrackableRow = {
    legacyId: string;
    userId: string;
    listId?: string;
    [k: string]: unknown;
  };
  const trackablesRaw = readJsonl<TrackableRow>("trackables.jsonl");
  const trackablesResolved = resolveFks(trackablesRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "listId", map: listsMap, required: false },
  ]);
  if (trackablesResolved.dropped)
    console.log(`    trackables: dropped ${trackablesResolved.dropped}`);
  const trackablesMap = await loadTable(
    client,
    "trackables",
    trackablesResolved.rows,
  );

  // ---- Recurring tasks (FK: list, section, trackable, tagIds) ----
  type RecurringTaskRow = {
    legacyId: string;
    userId: string;
    listId?: string;
    sectionId?: string;
    trackableId?: string;
    tagIds?: string[];
    [k: string]: unknown;
  };
  const recTasksRaw = readJsonl<RecurringTaskRow>("recurringTasks.jsonl");
  const recTasksResolved = resolveFks(
    recTasksRaw,
    [
      { field: "userId", map: usersMap, required: true },
      { field: "listId", map: listsMap, required: false },
      { field: "sectionId", map: sectionsMap, required: false },
      { field: "trackableId", map: trackablesMap, required: false },
    ],
    [{ field: "tagIds", map: tagsMap }],
  );
  if (recTasksResolved.dropped)
    console.log(`    recurringTasks: dropped ${recTasksResolved.dropped}`);
  const recTasksMap = await loadTable(
    client,
    "recurringTasks",
    recTasksResolved.rows,
  );

  // ---- Recurring events (FK: trackable, tagIds) ----
  type RecurringEventRow = {
    legacyId: string;
    userId: string;
    trackableId?: string;
    tagIds?: string[];
    [k: string]: unknown;
  };
  const recEventsRaw = readJsonl<RecurringEventRow>("recurringEvents.jsonl");
  const recEventsResolved = resolveFks(
    recEventsRaw,
    [
      { field: "userId", map: usersMap, required: true },
      { field: "trackableId", map: trackablesMap, required: false },
    ],
    [{ field: "tagIds", map: tagsMap }],
  );
  if (recEventsResolved.dropped)
    console.log(`    recurringEvents: dropped ${recEventsResolved.dropped}`);
  const recEventsMap = await loadTable(
    client,
    "recurringEvents",
    recEventsResolved.rows,
  );

  // ---- Tasks PASS 1: insert without parentId/rootTaskId ----
  type TaskRow = {
    legacyId: string;
    userId: string;
    createdBy: string;
    assignedToUserId?: string;
    parentId?: string;
    rootTaskId?: string;
    listId?: string;
    sectionId?: string;
    trackableId?: string;
    recurringTaskId?: string;
    [k: string]: unknown;
  };
  const tasksRaw = readJsonl<TaskRow>("tasks.jsonl");
  const tasksPass1Input = tasksRaw.map((r) => {
    const { parentId, rootTaskId, ...rest } = r;
    void parentId;
    void rootTaskId;
    return rest as TaskRow;
  });
  const tasksResolved = resolveFks(tasksPass1Input, [
    { field: "userId", map: usersMap, required: true },
    { field: "createdBy", map: usersMap, required: true },
    { field: "assignedToUserId", map: usersMap, required: false },
    { field: "listId", map: listsMap, required: false },
    { field: "sectionId", map: sectionsMap, required: false },
    { field: "trackableId", map: trackablesMap, required: false },
    { field: "recurringTaskId", map: recTasksMap, required: false },
  ]);
  if (tasksResolved.dropped)
    console.log(`    tasks: dropped ${tasksResolved.dropped}`);
  const tasksMap = await loadTable(client, "tasks", tasksResolved.rows);

  // ---- Tasks PASS 2: patch parentId / rootTaskId ----
  const tasksPass2 = tasksRaw
    .map((r) => {
      const out: {
        legacyId: string;
        parentId?: Id<"tasks">;
        rootTaskId?: Id<"tasks">;
      } = { legacyId: r.legacyId };
      if (r.parentId) {
        const id = tasksMap.get(r.parentId);
        if (id) out.parentId = id as Id<"tasks">;
      }
      if (r.rootTaskId) {
        const id = tasksMap.get(r.rootTaskId);
        if (id) out.rootTaskId = id as Id<"tasks">;
      }
      return out;
    })
    .filter((r) => r.parentId !== undefined || r.rootTaskId !== undefined);
  let patched = 0;
  let missing = 0;
  for (let i = 0; i < tasksPass2.length; i += BATCH_SIZE) {
    const batch = tasksPass2.slice(i, i + BATCH_SIZE);
    const res = await client.mutation(
      internal._admin.import.patchTaskParents,
      { rows: batch },
    );
    patched += res.patched;
    missing += res.missing;
  }
  console.log(
    `  tasks (pass 2): ${tasksPass2.length} candidates, ${patched} patched, ${missing} missing`,
  );

  // ---- Task tags ----
  type TaskTagRow = { legacyId: string; taskId: string; tagId: string };
  const taskTagsRaw = readJsonl<TaskTagRow>("taskTags.jsonl");
  const taskTagsResolved = resolveFks(taskTagsRaw, [
    { field: "taskId", map: tasksMap, required: true },
    { field: "tagId", map: tagsMap, required: true },
  ]);
  if (taskTagsResolved.dropped)
    console.log(`    taskTags: dropped ${taskTagsResolved.dropped}`);
  await loadTable(client, "taskTags", taskTagsResolved.rows);

  // ---- Task days ----
  type TaskDayRow = {
    legacyId: string;
    userId: string;
    taskId: string;
    dayYYYYMMDD: string;
    orderIndex: number;
  };
  const taskDaysRaw = readJsonl<TaskDayRow>("taskDays.jsonl");
  const taskDaysResolved = resolveFks(taskDaysRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "taskId", map: tasksMap, required: true },
  ]);
  if (taskDaysResolved.dropped)
    console.log(`    taskDays: dropped ${taskDaysResolved.dropped}`);
  await loadTable(client, "taskDays", taskDaysResolved.rows);

  // ---- User task day order ----
  type UTDORow = {
    legacyId: string;
    userId: string;
    taskId: string;
    taskDay: string;
    orderIndex: number;
  };
  const utdoRaw = readJsonl<UTDORow>("userTaskDayOrder.jsonl");
  const utdoResolved = resolveFks(utdoRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "taskId", map: tasksMap, required: true },
  ]);
  if (utdoResolved.dropped)
    console.log(`    userTaskDayOrder: dropped ${utdoResolved.dropped}`);
  await loadTable(client, "userTaskDayOrder", utdoResolved.rows);

  // ---- Task list ordering (0 rows in this dump but keep the wiring) ----
  type TLORow = {
    legacyId: string;
    userId: string;
    listId: string;
    taskId: string;
    orderIndex: number;
  };
  const tloRaw = readJsonl<TLORow>("taskListOrdering.jsonl");
  const tloResolved = resolveFks(tloRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "listId", map: listsMap, required: true },
    { field: "taskId", map: tasksMap, required: true },
  ]);
  if (tloResolved.dropped)
    console.log(`    taskListOrdering: dropped ${tloResolved.dropped}`);
  await loadTable(client, "taskListOrdering", tloResolved.rows);

  // ---- Root task ordering ----
  type RTORow = {
    legacyId: string;
    userId: string;
    rootTaskId: string;
    taskId: string;
    orderIndex: number;
  };
  const rtoRaw = readJsonl<RTORow>("rootTaskOrdering.jsonl");
  const rtoResolved = resolveFks(rtoRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "rootTaskId", map: tasksMap, required: true },
    { field: "taskId", map: tasksMap, required: true },
  ]);
  if (rtoResolved.dropped)
    console.log(`    rootTaskOrdering: dropped ${rtoResolved.dropped}`);
  await loadTable(client, "rootTaskOrdering", rtoResolved.rows);

  // ---- Task comments ----
  type TaskCommentRow = {
    legacyId: string;
    taskId: string;
    userId: string;
    commentText: string;
  };
  const tcRaw = readJsonl<TaskCommentRow>("taskComments.jsonl");
  const tcResolved = resolveFks(tcRaw, [
    { field: "taskId", map: tasksMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (tcResolved.dropped)
    console.log(`    taskComments: dropped ${tcResolved.dropped}`);
  await loadTable(client, "taskComments", tcResolved.rows);

  // ---- Task timers (PK == userId; one per user) ----
  type TaskTimerRow = {
    legacyId: string;
    userId: string;
    taskId?: string;
    trackableId?: string;
    timeZone: string;
    startTime: number;
  };
  const ttRaw = readJsonl<TaskTimerRow>("taskTimers.jsonl");
  const ttResolved = resolveFks(ttRaw, [
    { field: "userId", map: usersMap, required: true },
    { field: "taskId", map: tasksMap, required: false },
    { field: "trackableId", map: trackablesMap, required: false },
  ]);
  // legacyId is the raw user UUID; rewrite it to the Convex user _id so
  // subsequent loads are still keyed on something stable per user.
  const ttRewritten = ttResolved.rows.map((r) => ({
    ...r,
    legacyId: usersMap.get(r.legacyId) ?? r.legacyId,
  }));
  await loadTable(client, "taskTimers", ttRewritten);

  // ---- Time windows (FK: task, trackable, tagIds, recurringEvent) ----
  type TimeWindowRow = {
    legacyId: string;
    userId: string;
    taskId?: string;
    trackableId?: string;
    tagIds?: string[];
    recurringEventId?: string;
    [k: string]: unknown;
  };
  const twRaw = readJsonl<TimeWindowRow>("timeWindows.jsonl");
  const twResolved = resolveFks(
    twRaw,
    [
      { field: "userId", map: usersMap, required: true },
      { field: "taskId", map: tasksMap, required: false },
      { field: "trackableId", map: trackablesMap, required: false },
      { field: "recurringEventId", map: recEventsMap, required: false },
    ],
    [{ field: "tagIds", map: tagsMap }],
  );
  if (twResolved.dropped)
    console.log(`    timeWindows: dropped ${twResolved.dropped}`);
  await loadTable(client, "timeWindows", twResolved.rows);

  // ---- Trackable days ----
  type TrackableDayRow = {
    legacyId: string;
    trackableId: string;
    userId: string;
    dayYYYYMMDD: string;
    numCompleted: number;
    comments: string;
  };
  const tdRaw = readJsonl<TrackableDayRow>("trackableDays.jsonl");
  const tdResolved = resolveFks(tdRaw, [
    { field: "trackableId", map: trackablesMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (tdResolved.dropped)
    console.log(`    trackableDays: dropped ${tdResolved.dropped}`);
  await loadTable(client, "trackableDays", tdResolved.rows);

  // ---- Tracker entries ----
  type TrackerEntryRow = {
    legacyId: string;
    trackableId: string;
    userId: string;
    [k: string]: unknown;
  };
  const teRaw = readJsonl<TrackerEntryRow>("trackerEntries.jsonl");
  const teResolved = resolveFks(teRaw, [
    { field: "trackableId", map: trackablesMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (teResolved.dropped)
    console.log(`    trackerEntries: dropped ${teResolved.dropped}`);
  await loadTable(client, "trackerEntries", teResolved.rows);

  // ---- List <-> trackable links ----
  type LTLRow = {
    legacyId: string;
    listId: string;
    trackableId: string;
    userId: string;
  };
  const ltlRaw = readJsonl<LTLRow>("listTrackableLinks.jsonl");
  const ltlResolved = resolveFks(ltlRaw, [
    { field: "listId", map: listsMap, required: true },
    { field: "trackableId", map: trackablesMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (ltlResolved.dropped)
    console.log(`    listTrackableLinks: dropped ${ltlResolved.dropped}`);
  await loadTable(client, "listTrackableLinks", ltlResolved.rows);

  // ---- Deleted recurring (task) occurrences ----
  type DRORow = {
    legacyId: string;
    recurringTaskId: string;
    deletedDateYYYYMMDD: string;
    userId: string;
  };
  const droRaw = readJsonl<DRORow>("deletedRecurringOccurrences.jsonl");
  const droResolved = resolveFks(droRaw, [
    { field: "recurringTaskId", map: recTasksMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (droResolved.dropped)
    console.log(
      `    deletedRecurringOccurrences: dropped ${droResolved.dropped}`,
    );
  await loadTable(client, "deletedRecurringOccurrences", droResolved.rows);

  // ---- Deleted recurring event occurrences ----
  type DREORow = {
    legacyId: string;
    recurringEventId: string;
    deletedDateYYYYMMDD: string;
    userId: string;
  };
  const dreoRaw = readJsonl<DREORow>("deletedRecurringEventOccurrences.jsonl");
  const dreoResolved = resolveFks(dreoRaw, [
    { field: "recurringEventId", map: recEventsMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (dreoResolved.dropped)
    console.log(
      `    deletedRecurringEventOccurrences: dropped ${dreoResolved.dropped}`,
    );
  await loadTable(
    client,
    "deletedRecurringEventOccurrences",
    dreoResolved.rows,
  );

  // ---- Trackable shares ----
  type TrackableShareRow = {
    legacyId: string;
    trackableId: string;
    sharedWithUserId: string;
    permission: string;
    status: string;
  };
  const trShRaw = readJsonl<TrackableShareRow>("trackableShares.jsonl");
  const trShResolved = resolveFks(trShRaw, [
    { field: "trackableId", map: trackablesMap, required: true },
    { field: "sharedWithUserId", map: usersMap, required: true },
  ]);
  if (trShResolved.dropped)
    console.log(`    trackableShares: dropped ${trShResolved.dropped}`);
  await loadTable(client, "trackableShares", trShResolved.rows);

  // ---- List shares ----
  type ListShareRow = {
    legacyId: string;
    listId: string;
    sharedWithUserId: string;
    permission: string;
    status: string;
  };
  const lShRaw = readJsonl<ListShareRow>("listShares.jsonl");
  const lShResolved = resolveFks(lShRaw, [
    { field: "listId", map: listsMap, required: true },
    { field: "sharedWithUserId", map: usersMap, required: true },
  ]);
  if (lShResolved.dropped)
    console.log(`    listShares: dropped ${lShResolved.dropped}`);
  await loadTable(client, "listShares", lShResolved.rows);

  // ---- Pending list invites ----
  type PLIRow = {
    legacyId: string;
    listId: string;
    invitedEmail: string;
    permission: string;
    invitedByUserId: string;
  };
  const pliRaw = readJsonl<PLIRow>("pendingListInvites.jsonl");
  const pliResolved = resolveFks(pliRaw, [
    { field: "listId", map: listsMap, required: true },
    { field: "invitedByUserId", map: usersMap, required: true },
  ]);
  if (pliResolved.dropped)
    console.log(`    pendingListInvites: dropped ${pliResolved.dropped}`);
  await loadTable(client, "pendingListInvites", pliResolved.rows);

  // ---- Review questions ----
  type RQRow = {
    legacyId: string;
    userId: string;
    questionText: string;
    frequency: string;
    orderIndex: number;
    archived: boolean;
  };
  const rqRaw = readJsonl<RQRow>("reviewQuestions.jsonl");
  const rqResolved = resolveFks(rqRaw, [
    { field: "userId", map: usersMap, required: true },
  ]);
  if (rqResolved.dropped)
    console.log(`    reviewQuestions: dropped ${rqResolved.dropped}`);
  const rqMap = await loadTable(client, "reviewQuestions", rqResolved.rows);

  // ---- Review answers ----
  type RARow = {
    legacyId: string;
    reviewQuestionId: string;
    userId: string;
    [k: string]: unknown;
  };
  const raRaw = readJsonl<RARow>("reviewAnswers.jsonl");
  const raResolved = resolveFks(raRaw, [
    { field: "reviewQuestionId", map: rqMap, required: true },
    { field: "userId", map: usersMap, required: true },
  ]);
  if (raResolved.dropped)
    console.log(`    reviewAnswers: dropped ${raResolved.dropped}`);
  await loadTable(client, "reviewAnswers", raResolved.rows);

  console.log("\nLoad complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
