/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _admin_backfillAttributedTaskDayCount from "../_admin/backfillAttributedTaskDayCount.js";
import type * as _admin_backfillTaskTagIds from "../_admin/backfillTaskTagIds.js";
import type * as _admin_backfillTaskTimeSpent from "../_admin/backfillTaskTimeSpent.js";
import type * as _admin_backfillTrackableDayAttributedTaskCount from "../_admin/backfillTrackableDayAttributedTaskCount.js";
import type * as _admin_backfillTrackableDaySeconds from "../_admin/backfillTrackableDaySeconds.js";
import type * as _admin_backfillTrackableLifetime from "../_admin/backfillTrackableLifetime.js";
import type * as _admin_backfillTrackableWeekStats from "../_admin/backfillTrackableWeekStats.js";
import type * as _admin_backfillTrackerAverages from "../_admin/backfillTrackerAverages.js";
import type * as _admin_backfillWindowTrackableSnapshot from "../_admin/backfillWindowTrackableSnapshot.js";
import type * as _admin_cleanup from "../_admin/cleanup.js";
import type * as _admin_cognitoBridge from "../_admin/cognitoBridge.js";
import type * as _admin_debugTrackableWindows from "../_admin/debugTrackableWindows.js";
import type * as _admin_diagnoseMinutesAWeekProgress from "../_admin/diagnoseMinutesAWeekProgress.js";
import type * as _admin_fixMigratedWindowTimeZones from "../_admin/fixMigratedWindowTimeZones.js";
import type * as _admin_import from "../_admin/import.js";
import type * as _admin_repairTrackableLifetime from "../_admin/repairTrackableLifetime.js";
import type * as _admin_wipe from "../_admin/wipe.js";
import type * as _helpers_activeTimerCalendarDisplay from "../_helpers/activeTimerCalendarDisplay.js";
import type * as _helpers_auth from "../_helpers/auth.js";
import type * as _helpers_compactYYYYMMDD from "../_helpers/compactYYYYMMDD.js";
import type * as _helpers_eventColors from "../_helpers/eventColors.js";
import type * as _helpers_ordering from "../_helpers/ordering.js";
import type * as _helpers_permissions from "../_helpers/permissions.js";
import type * as _helpers_recurrence from "../_helpers/recurrence.js";
import type * as _helpers_taskTimeSpent from "../_helpers/taskTimeSpent.js";
import type * as _helpers_timeWindowDisplayEnrichment from "../_helpers/timeWindowDisplayEnrichment.js";
import type * as _helpers_trackableAttribution from "../_helpers/trackableAttribution.js";
import type * as _helpers_trackableLifetime from "../_helpers/trackableLifetime.js";
import type * as _helpers_wallClockTimeZone from "../_helpers/wallClockTimeZone.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as lib_sendOtpEmail from "../lib/sendOtpEmail.js";
import type * as listSections from "../listSections.js";
import type * as lists from "../lists.js";
import type * as pushTokens from "../pushTokens.js";
import type * as recurringEvents from "../recurringEvents.js";
import type * as recurringTasks from "../recurringTasks.js";
import type * as reviews from "../reviews.js";
import type * as sharing from "../sharing.js";
import type * as tags from "../tags.js";
import type * as taskComments from "../taskComments.js";
import type * as tasks from "../tasks.js";
import type * as timeWindows from "../timeWindows.js";
import type * as timerNotifications from "../timerNotifications.js";
import type * as timers from "../timers.js";
import type * as trackableDays from "../trackableDays.js";
import type * as trackables from "../trackables.js";
import type * as trackerEntries from "../trackerEntries.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_admin/backfillAttributedTaskDayCount": typeof _admin_backfillAttributedTaskDayCount;
  "_admin/backfillTaskTagIds": typeof _admin_backfillTaskTagIds;
  "_admin/backfillTaskTimeSpent": typeof _admin_backfillTaskTimeSpent;
  "_admin/backfillTrackableDayAttributedTaskCount": typeof _admin_backfillTrackableDayAttributedTaskCount;
  "_admin/backfillTrackableDaySeconds": typeof _admin_backfillTrackableDaySeconds;
  "_admin/backfillTrackableLifetime": typeof _admin_backfillTrackableLifetime;
  "_admin/backfillTrackableWeekStats": typeof _admin_backfillTrackableWeekStats;
  "_admin/backfillTrackerAverages": typeof _admin_backfillTrackerAverages;
  "_admin/backfillWindowTrackableSnapshot": typeof _admin_backfillWindowTrackableSnapshot;
  "_admin/cleanup": typeof _admin_cleanup;
  "_admin/cognitoBridge": typeof _admin_cognitoBridge;
  "_admin/debugTrackableWindows": typeof _admin_debugTrackableWindows;
  "_admin/diagnoseMinutesAWeekProgress": typeof _admin_diagnoseMinutesAWeekProgress;
  "_admin/fixMigratedWindowTimeZones": typeof _admin_fixMigratedWindowTimeZones;
  "_admin/import": typeof _admin_import;
  "_admin/repairTrackableLifetime": typeof _admin_repairTrackableLifetime;
  "_admin/wipe": typeof _admin_wipe;
  "_helpers/activeTimerCalendarDisplay": typeof _helpers_activeTimerCalendarDisplay;
  "_helpers/auth": typeof _helpers_auth;
  "_helpers/compactYYYYMMDD": typeof _helpers_compactYYYYMMDD;
  "_helpers/eventColors": typeof _helpers_eventColors;
  "_helpers/ordering": typeof _helpers_ordering;
  "_helpers/permissions": typeof _helpers_permissions;
  "_helpers/recurrence": typeof _helpers_recurrence;
  "_helpers/taskTimeSpent": typeof _helpers_taskTimeSpent;
  "_helpers/timeWindowDisplayEnrichment": typeof _helpers_timeWindowDisplayEnrichment;
  "_helpers/trackableAttribution": typeof _helpers_trackableAttribution;
  "_helpers/trackableLifetime": typeof _helpers_trackableLifetime;
  "_helpers/wallClockTimeZone": typeof _helpers_wallClockTimeZone;
  analytics: typeof analytics;
  auth: typeof auth;
  crons: typeof crons;
  http: typeof http;
  "lib/sendOtpEmail": typeof lib_sendOtpEmail;
  listSections: typeof listSections;
  lists: typeof lists;
  pushTokens: typeof pushTokens;
  recurringEvents: typeof recurringEvents;
  recurringTasks: typeof recurringTasks;
  reviews: typeof reviews;
  sharing: typeof sharing;
  tags: typeof tags;
  taskComments: typeof taskComments;
  tasks: typeof tasks;
  timeWindows: typeof timeWindows;
  timerNotifications: typeof timerNotifications;
  timers: typeof timers;
  trackableDays: typeof trackableDays;
  trackables: typeof trackables;
  trackerEntries: typeof trackerEntries;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
