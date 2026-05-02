/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _admin_cleanup from "../_admin/cleanup.js";
import type * as _admin_cognitoBridge from "../_admin/cognitoBridge.js";
import type * as _admin_import from "../_admin/import.js";
import type * as _helpers_auth from "../_helpers/auth.js";
import type * as _helpers_compactYYYYMMDD from "../_helpers/compactYYYYMMDD.js";
import type * as _helpers_eventColors from "../_helpers/eventColors.js";
import type * as _helpers_ordering from "../_helpers/ordering.js";
import type * as _helpers_permissions from "../_helpers/permissions.js";
import type * as _helpers_recurrence from "../_helpers/recurrence.js";
import type * as _helpers_trackableAttribution from "../_helpers/trackableAttribution.js";
import type * as analytics from "../analytics.js";
import type * as auth from "../auth.js";
import type * as http from "../http.js";
import type * as listSections from "../listSections.js";
import type * as lists from "../lists.js";
import type * as recurringEvents from "../recurringEvents.js";
import type * as recurringTasks from "../recurringTasks.js";
import type * as reviews from "../reviews.js";
import type * as sharing from "../sharing.js";
import type * as tags from "../tags.js";
import type * as taskComments from "../taskComments.js";
import type * as tasks from "../tasks.js";
import type * as timeWindows from "../timeWindows.js";
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
  "_admin/cleanup": typeof _admin_cleanup;
  "_admin/cognitoBridge": typeof _admin_cognitoBridge;
  "_admin/import": typeof _admin_import;
  "_helpers/auth": typeof _helpers_auth;
  "_helpers/compactYYYYMMDD": typeof _helpers_compactYYYYMMDD;
  "_helpers/eventColors": typeof _helpers_eventColors;
  "_helpers/ordering": typeof _helpers_ordering;
  "_helpers/permissions": typeof _helpers_permissions;
  "_helpers/recurrence": typeof _helpers_recurrence;
  "_helpers/trackableAttribution": typeof _helpers_trackableAttribution;
  analytics: typeof analytics;
  auth: typeof auth;
  http: typeof http;
  listSections: typeof listSections;
  lists: typeof lists;
  recurringEvents: typeof recurringEvents;
  recurringTasks: typeof recurringTasks;
  reviews: typeof reviews;
  sharing: typeof sharing;
  tags: typeof tags;
  taskComments: typeof taskComments;
  tasks: typeof tasks;
  timeWindows: typeof timeWindows;
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
