/**
 * Batch-enrichment for calendar / edit-history display (parity with productivity-one).
 * Shared by `timeWindows.search` and `trackables.getEditDialogTrackingHistory`.
 */
import type { Doc, Id } from "../_generated/dataModel";
import { deriveEventColors } from "./eventColors";
import {
  buildListIdToTrackableId,
  buildTaskInfoMap,
  resolveAttributedTrackableId,
} from "./trackableAttribution";

export type EnrichedTimeWindowDoc = Doc<"timeWindows"> & {
  displayTitle: string;
  derivedTitle?: string;
  displayColor?: string;
  secondaryColor?: string;
};

export function enrichTimeWindowsWithDisplayFields(
  filtered: Doc<"timeWindows">[],
  tasksById: Map<string, Doc<"tasks">>,
  listsById: Map<string, Doc<"lists">>,
  trackablesById: Map<string, Doc<"trackables">>,
  links: Array<
    Pick<Doc<"listTrackableLinks">, "listId" | "trackableId">
  >
): EnrichedTimeWindowDoc[] {
  const listIdToTrackableId = buildListIdToTrackableId(links);
  const taskInfoMap = buildTaskInfoMap(Array.from(tasksById.values()));

  return filtered.map((w) => {
    let trackableColour: string | undefined;
    let listColour: string | undefined;
    let derivedTitle: string | undefined;

    const directListDoc = w.listId ? listsById.get(w.listId) : undefined;

    if (w.activityType === "EVENT") {
      const eventTrackable = w.trackableId
        ? trackablesById.get(w.trackableId)
        : undefined;
      if (directListDoc?.name) derivedTitle = directListDoc.name;
      else if (eventTrackable?.name) derivedTitle = eventTrackable.name;
      listColour = directListDoc?.colour;
      trackableColour = eventTrackable?.colour;
    } else if (w.activityType === "TRACKABLE" && w.trackableId) {
      const trackable = trackablesById.get(w.trackableId);
      if (directListDoc?.name) {
        derivedTitle = directListDoc.name;
      } else if (trackable?.name) {
        derivedTitle = trackable.name;
      }
      trackableColour = trackable?.colour;
      listColour = directListDoc?.colour;
    } else if (w.activityType === "TASK") {
      const task = w.taskId ? tasksById.get(w.taskId) : undefined;
      const taskListDoc = task?.listId
        ? listsById.get(task.listId)
        : undefined;
      if (task?.name) {
        derivedTitle = task.name;
      } else if (directListDoc?.name) {
        derivedTitle = directListDoc.name;
      } else if (taskListDoc?.name) {
        derivedTitle = taskListDoc.name;
      }

      const resolvedTrackableId = resolveAttributedTrackableId(
        { trackableId: w.trackableId, taskId: w.taskId },
        taskInfoMap,
        listIdToTrackableId
      );
      trackableColour = resolvedTrackableId
        ? trackablesById.get(resolvedTrackableId)?.colour
        : undefined;
      listColour = taskListDoc?.colour;
    }

    const { displayColor, secondaryColor } = deriveEventColors(
      trackableColour,
      listColour
    );

    const fallback = w.activityType === "EVENT" ? "Event" : "Untitled";
    const displayTitle = w.title ?? derivedTitle ?? fallback;

    return {
      ...w,
      displayTitle,
      derivedTitle,
      displayColor,
      secondaryColor,
    };
  });
}
