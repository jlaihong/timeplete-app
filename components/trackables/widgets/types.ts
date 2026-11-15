import type { FunctionReturnType } from "convex/server";
import type { api } from "../../../convex/_generated/api";

/**
 * The per-trackable goal-detail object as returned by
 * `api.trackables.getGoalDetails`. Both active and archived rows have the same
 * shape; widgets receive one of these.
 */
export type WidgetGoal = FunctionReturnType<
  typeof api.trackables.getGoalDetails
>["active"][number];

/**
 * A request to open the full log dialog for a trackable on a day. Cards
 * do **not** render dialogs themselves: they bubble a `LogRequest` up to a
 * single dialog host mounted at the root of the screen (`DesktopHome`).
 * This avoids mounting `Modal` portals from inside the virtualized
 * `FlatList` (which would be clipped by ancestor stacking contexts and is
 * also broken under React `StrictMode` for `react-native-web`'s
 * `ModalPortal`). The host picks the dialog from what the trackable
 * measures (`TrackableLogDialog`).
 */
export interface LogRequest {
  trackableId: WidgetGoal["_id"];
  /** YYYYMMDD (no dashes). */
  dayYYYYMMDD: string;
}

/**
 * Common props every per-type widget receives. The card chrome (header,
 * context menu, type badge, etc.) lives in `TrackableWidgetCard`; the per-type
 * components only render the body.
 */
export interface WidgetBodyProps {
  goal: WidgetGoal;
  /** YYYYMMDD (no dashes) for "today" — passed down for stats / dialogs. */
  today: string;
  /** Bubble up a request to open a quick-log dialog. */
  onRequestLog: (req: LogRequest) => void;
}
