/**
 * Which trackables the home screen's side column shows.
 *
 * Home is for what you are actively working on, so a trackable is left off
 * when the user unpinned it, or when it is a goal whose end date passed
 * more than `ENDED_GRACE_DAYS` ago. Nothing is archived or deleted: every
 * trackable stays on the Trackables page.
 */
import { daysBetweenYYYYMMDD } from "./dates";

/** A just-finished goal stays visible this long so its result can be seen. */
export const ENDED_GRACE_DAYS = 7;

export type HomeVisibilityTrackable = {
  showOnHome?: boolean;
  trackableType: string;
  endDayYYYYMMDD: string;
};

export type HomeHiddenReason = "unpinned" | "ended";

export function homeHiddenReason(
  trackable: HomeVisibilityTrackable,
  today: string,
): HomeHiddenReason | null {
  if (trackable.showOnHome === false) return "unpinned";
  // An explicit pin beats the end-date rule.
  if (trackable.showOnHome === true) return null;
  // Trackers are open-ended; their end date is not meaningful.
  if (trackable.trackableType === "TRACKER") return null;
  if (!trackable.endDayYYYYMMDD) return null;
  const daysLeft = daysBetweenYYYYMMDD(today, trackable.endDayYYYYMMDD);
  if (Number.isFinite(daysLeft) && daysLeft < -ENDED_GRACE_DAYS) return "ended";
  return null;
}

export function splitTrackablesForHome<T extends HomeVisibilityTrackable>(
  trackables: readonly T[],
  today: string,
): { shown: T[]; hiddenCount: number } {
  const shown = trackables.filter((t) => homeHiddenReason(t, today) === null);
  return { shown, hiddenCount: trackables.length - shown.length };
}
