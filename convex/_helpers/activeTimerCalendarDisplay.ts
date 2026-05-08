/**
 * Display title + colours for the active task timer row on the calendar
 * (parity with `timeWindows.search` / `enrichTimeWindowsWithDisplayFields`).
 */
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import { DEFAULT_EVENT_COLOR, deriveEventColors } from "./eventColors";
import {
  buildListIdToTrackableId,
  buildTaskInfoMap,
  resolveAttributedTrackableId,
} from "./trackableAttribution";

export type ActiveTimerCalendarDisplay = {
  displayTitle: string;
  displayColor: string;
  secondaryColor?: string;
};

export async function resolveTaskTimerCalendarDisplay(
  ctx: QueryCtx,
  userId: Id<"users">,
  task: Doc<"tasks">,
): Promise<ActiveTimerCalendarDisplay> {
  const links = await ctx.db
    .query("listTrackableLinks")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const listIdToTrackableId = buildListIdToTrackableId(links);
  const taskInfoMap = buildTaskInfoMap([task]);
  const taskListDoc = task.listId ? await ctx.db.get(task.listId) : null;
  const derivedTitle = task.name || taskListDoc?.name || "Task";

  const resolvedTrackableId = resolveAttributedTrackableId(
    {
      trackableId: task.trackableId ?? undefined,
      taskId: task._id,
      listId: undefined,
    },
    taskInfoMap,
    listIdToTrackableId,
  );
  const trackableDoc = resolvedTrackableId
    ? await ctx.db.get(resolvedTrackableId)
    : null;
  const { displayColor, secondaryColor } = deriveEventColors(
    trackableDoc?.colour,
    taskListDoc?.colour,
  );
  return { displayTitle: derivedTitle, displayColor, secondaryColor };
}

export function resolveTrackableDocCalendarDisplay(
  trackable: Doc<"trackables">,
): ActiveTimerCalendarDisplay {
  const name = trackable.name ?? "Trackable";
  const { displayColor, secondaryColor } = deriveEventColors(
    trackable.colour,
    undefined,
  );
  return { displayTitle: name, displayColor, secondaryColor };
}

export async function resolveActiveTimerCalendarDisplay(
  ctx: QueryCtx,
  userId: Id<"users">,
  timer: Doc<"taskTimers">,
): Promise<ActiveTimerCalendarDisplay> {
  if (timer.taskId) {
    const task = await ctx.db.get(timer.taskId);
    if (!task) {
      return { displayTitle: "Task", displayColor: DEFAULT_EVENT_COLOR };
    }
    return resolveTaskTimerCalendarDisplay(ctx, userId, task);
  }

  if (timer.trackableId) {
    const trackable = await ctx.db.get(timer.trackableId);
    if (!trackable) {
      return { displayTitle: "Trackable", displayColor: DEFAULT_EVENT_COLOR };
    }
    return resolveTrackableDocCalendarDisplay(trackable);
  }

  return {
    displayTitle: "Timer",
    displayColor: DEFAULT_EVENT_COLOR,
  };
}
