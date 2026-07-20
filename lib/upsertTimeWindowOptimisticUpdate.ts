/**
 * Optimistic Convex cache patch for `timeWindows.upsert` — update branch only
 * (dragging/resizing an existing calendar event). Mirrors
 * `removeTimeWindowOptimisticUpdate.ts`'s pattern so a move/resize is
 * reflected in `timeWindows.search` immediately, and rolled back by Convex
 * automatically if the mutation ultimately fails.
 *
 * Creates (no `id`) are intentionally left as a no-op: there's no reliable
 * way to project the server's enrichment (`displayTitle`/`displayColor`/etc,
 * see `convex/timeWindows.ts`'s `search` handler) without loading tasks /
 * trackables / lists client-side, and those call sites (task-drop-to-calendar,
 * undo-restore) already work fine waiting for the round trip.
 */
import type { OptimisticLocalStore } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import type { Id } from "../convex/_generated/dataModel";
import { api } from "../convex/_generated/api";
import { wallClockGridToEpochMs } from "./wallClockTimeZone";

type SearchTimeWindowRow = FunctionReturnType<
  typeof api.timeWindows.search
>[number];

export type UpsertTimeWindowOptimisticArgs = {
  id?: Id<"timeWindows">;
  startTimeHHMM: string;
  startDayYYYYMMDD: string;
  durationSeconds: number;
  budgetType: "ACTUAL" | "BUDGETED";
  activityType: "TASK" | "EVENT" | "TRACKABLE";
  taskId?: Id<"tasks">;
  trackableId?: Id<"trackables">;
  listId?: Id<"lists">;
  title?: string;
  comments?: string;
  tagIds?: Id<"tags">[];
  timeZone: string;
  source?: "timer" | "manual" | "calendar" | "tracker_entry";
};

/** Mirrors the private `minutesFromHHMM` in `convex/timeWindows.ts`. */
function minutesFromHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 0;
  return h * 60 + m;
}

/** Mirrors the private `computeStartEpochMsForWindow` in `convex/timeWindows.ts`. */
function computeOptimisticStartEpochMs(
  day: string,
  hhmm: string,
  timeZone: string,
): number | undefined {
  const tz =
    typeof timeZone === "string" && timeZone.trim() !== ""
      ? timeZone.trim()
      : "UTC";
  try {
    return wallClockGridToEpochMs(day, minutesFromHHMM(hhmm), tz);
  } catch {
    return undefined;
  }
}

/** Mirrors the server's title coercion in `convex/timeWindows.ts`'s `upsert` handler. */
function normalizeOptimisticTitle(title: string | undefined): string | undefined {
  return typeof title === "string" && title.trim().length > 0
    ? title.trim()
    : undefined;
}

function patchTimeWindowRow(
  existing: SearchTimeWindowRow,
  args: UpsertTimeWindowOptimisticArgs,
): SearchTimeWindowRow {
  return {
    ...existing,
    startTimeHHMM: args.startTimeHHMM,
    startDayYYYYMMDD: args.startDayYYYYMMDD,
    startTimeEpochMs: computeOptimisticStartEpochMs(
      args.startDayYYYYMMDD,
      args.startTimeHHMM,
      args.timeZone,
    ),
    durationSeconds: args.durationSeconds,
    budgetType: args.budgetType,
    activityType: args.activityType,
    taskId: args.taskId,
    trackableId: args.trackableId,
    listId: args.listId,
    title: normalizeOptimisticTitle(args.title),
    comments: args.comments,
    tagIds: args.tagIds,
    timeZone: args.timeZone,
    source: args.source ?? existing.source,
  };
}

/** Call from `useMutation(api.timeWindows.upsert).withOptimisticUpdate(...)`. */
export function applyUpsertTimeWindowOptimisticUpdate(
  localStore: OptimisticLocalStore,
  args: UpsertTimeWindowOptimisticArgs,
): void {
  if (!args.id) return;
  const rowId = args.id;
  for (const q of localStore.getAllQueries(api.timeWindows.search)) {
    const prev = q.value;
    if (!prev) continue;
    const idx = prev.findIndex((w) => String(w._id) === String(rowId));
    if (idx === -1) continue;
    const next = [...prev];
    next[idx] = patchTimeWindowRow(prev[idx], args);
    localStore.setQuery(api.timeWindows.search, q.args, next);
  }
}
