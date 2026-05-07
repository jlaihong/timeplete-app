import { timeWindowBoundsMs, tryParseYYYYMMDD } from "../../lib/dates";
import type { TimeWindowLite } from "./useAnalyticsDataset";
import type { TrackableLite } from "./useAnalyticsDataset";

export const SECONDS_PER_DAY = 86400;

export interface TimelineBlock {
  windowId: string;
  startSec: number;
  endSec: number;
  colour: string;
  trackableId: string | null;
}

export function clipTimeWindowToDay(
  w: TimeWindowLite,
  dayYYYYMMDD: string,
  resolveTrackableId: (tw: TimeWindowLite) => string | null,
  trackables: Record<string, TrackableLite | undefined>,
  fallbackColour: string,
): TimelineBlock | null {
  const bounds = timeWindowBoundsMs(w);
  const dayDate = tryParseYYYYMMDD(dayYYYYMMDD);
  if (!bounds || !dayDate) return null;

  const dayStart = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate(),
  ).getTime();
  const dayEnd = new Date(
    dayDate.getFullYear(),
    dayDate.getMonth(),
    dayDate.getDate() + 1,
  ).getTime();

  const segStart = Math.max(bounds.startMs, dayStart);
  const segEnd = Math.min(bounds.endMs, dayEnd);
  if (segEnd - segStart <= 0) return null;

  const tid = resolveTrackableId(w);
  const trackable = tid ? trackables[tid] : undefined;

  return {
    windowId: w._id,
    startSec: (segStart - dayStart) / 1000,
    endSec: (segEnd - dayStart) / 1000,
    colour: trackable?.colour ?? fallbackColour,
    trackableId: tid,
  };
}

export function buildBlocksForDay(
  windows: TimeWindowLite[],
  dayYYYYMMDD: string,
  resolveTrackableId: (tw: TimeWindowLite) => string | null,
  trackables: Record<string, TrackableLite | undefined>,
  fallbackColour: string,
): TimelineBlock[] {
  const out: TimelineBlock[] = [];
  for (const w of windows) {
    const b = clipTimeWindowToDay(
      w,
      dayYYYYMMDD,
      resolveTrackableId,
      trackables,
      fallbackColour,
    );
    if (b) out.push(b);
  }
  out.sort(
    (a, b) =>
      a.startSec - b.startSec ||
      a.endSec - b.endSec ||
      a.windowId.localeCompare(b.windowId),
  );
  return out;
}
