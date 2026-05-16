import type {
  NavigationContainerRef,
  NavigationContainerRefWithCurrent,
  ParamListBase,
} from "@react-navigation/native";
import type { RefObject } from "react";
import { routingQueue } from "expo-router/build/global-state/routing";

/**
 * Expo Router enqueues `router.navigate` / `replace` into `routingQueue` and
 * normally drains it from `useImperativeApiEmitter`'s `useEffect` — i.e. after
 * the current commit / paint. That defers browser URL updates by at least one
 * frame (often perceptible as a “slow” sidebar).
 *
 * Call this immediately after a router imperative call to dispatch the queued
 * action on the root container in the same JS task as the click handler.
 */
export function flushExpoRouterNavigationQueue(
  // Root navigation ref from `useNavigationContainerRef()` is typed to
  // Expo's RootParamList, not ParamListBase; the queue only needs `.current`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: NavigationContainerRefWithCurrent<any>,
): void {
  routingQueue.run(
    ref as unknown as RefObject<
      NavigationContainerRef<ParamListBase> | null
    >,
  );
}
