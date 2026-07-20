/**
 * Native half of long-running-timer reminders. Mounted once in the (app)
 * layout next to TimerCheckInGate; renders nothing.
 *
 * Two delivery paths, in order of preference:
 *
 *  1. LOCAL scheduled notifications (this file, no credentials needed).
 *     While a timer runs, the device schedules ONLY the next upcoming
 *     2h boundary. That caps stale reminders after a cross-device stop
 *     (e.g. timer stopped on web while the phone was closed) to at most
 *     one notification. Later boundaries are covered by the server cron
 *     when this device stays closed, or by rescheduling here when the
 *     app is open / returns to the foreground. The 24h auto-stop notice
 *     is left entirely to the server (`sendAutoStopNotification`) for
 *     the same reason.
 *
 *     After scheduling the next boundary we call
 *     `timers.claimLocalNotificationDelivery({ boundaryMs })` so the
 *     cron skips THAT boundary (avoids a duplicate push) but still
 *     handles subsequent ones.
 *
 *  2. REMOTE Expo push (server cron in convex/timerNotifications.ts).
 *     Covers timers started on the web when this device never opens the
 *     app during the run. Token registration is best-effort: if APNs/FCM
 *     credentials aren't configured yet, registration fails quietly and
 *     path 1 still works.
 *
 * Permission is requested the first time a timer is seen running —
 * contextual, instead of prompting at first app open.
 */
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../../hooks/useAuth";

const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const AUTO_STOP_MS = 24 * 60 * 60 * 1000;
/** How often to refresh the single pending schedule while a timer runs. */
const RESCHEDULE_POLL_MS = 60_000;

/** `data.type` values marking notifications owned by this feature. */
const TIMER_NOTIFICATION_TYPES = new Set([
  "timer-check-in",
  "timer-auto-stop",
]);

// Show timer reminders as banners even while the app is foregrounded —
// the in-app popup only appears once the gate's 30s poll catches up, and
// a banner is not disruptive.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("timer-reminders", {
    name: "Timer reminders",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
  });
}

async function cancelTimerNotifications(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) =>
        TIMER_NOTIFICATION_TYPES.has(String(n.content.data?.type ?? "")),
      )
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

/**
 * Next 2h check-in boundary strictly after `now`, or `null` once the
 * timer is in the auto-stop window (server owns that notice).
 */
function nextCheckInBoundaryMs(startTime: number, now: number): number | null {
  const elapsed = Math.max(0, now - startTime);
  const next =
    Math.floor(elapsed / CHECK_IN_INTERVAL_MS) * CHECK_IN_INTERVAL_MS +
    CHECK_IN_INTERVAL_MS;
  if (next >= AUTO_STOP_MS) return null;
  return next;
}

/**
 * Cancel any prior timer schedules and arm a single local notification
 * for the next check-in boundary. Returns that boundary (ms elapsed) so
 * the caller can claim it server-side, or `null` when nothing is due.
 */
async function scheduleNextTimerNotification(
  startTime: number,
  displayTitle: string,
): Promise<number | null> {
  await cancelTimerNotifications();
  const now = Date.now();
  const boundaryMs = nextCheckInBoundaryMs(startTime, now);
  if (boundaryMs == null) return null;
  const fireAt = startTime + boundaryMs;
  if (fireAt <= now) return null;

  const hours = Math.round(boundaryMs / 3_600_000);
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Timer still running",
      body: `"${displayTitle}" has been running for ${hours} hours. Still working on it?`,
      sound: "default",
      data: { type: "timer-check-in", boundaryMs: String(boundaryMs) },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(fireAt),
      channelId: Platform.OS === "android" ? "timer-reminders" : undefined,
    },
  });
  return boundaryMs;
}

/** Best-effort remote-push registration; fails quietly without APNs/FCM. */
async function registerPushToken(
  register: (args: {
    token: string;
    platform: "ios" | "android";
  }) => Promise<null>,
): Promise<void> {
  try {
    const projectId: string | undefined =
      Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return;
    const { data: token } = await Notifications.getExpoPushTokenAsync({
      projectId,
    });
    if (token && (Platform.OS === "ios" || Platform.OS === "android")) {
      await register({ token, platform: Platform.OS });
    }
  } catch (err) {
    console.log(
      "TimerNotifications: remote push unavailable (local scheduling still active):",
      String(err),
    );
  }
}

export function TimerNotifications() {
  const { profileReady } = useAuth();
  const timer = useQuery(api.timers.get, profileReady ? {} : "skip");
  const registerToken = useMutation(api.pushTokens.register);
  const claimLocalDelivery = useMutation(
    api.timers.claimLocalNotificationDelivery,
  );

  const startTime = timer === undefined ? undefined : timer?.startTime ?? null;
  const displayTitle = timer?.displayTitle ?? "Timer";
  const registeredTokenRef = useRef(false);
  const claimedBoundaryRef = useRef<number | null>(null);
  const displayTitleRef = useRef(displayTitle);
  displayTitleRef.current = displayTitle;

  useEffect(() => {
    // undefined = query still loading; don't cancel schedules yet.
    if (startTime === undefined) return;

    let cancelled = false;
    claimedBoundaryRef.current = null;

    const sync = async () => {
      try {
        if (startTime === null) {
          await cancelTimerNotifications();
          claimedBoundaryRef.current = null;
          return;
        }
        const granted = await ensurePermission();
        if (!granted || cancelled) return;
        await ensureAndroidChannel();
        if (cancelled) return;

        const boundaryMs = await scheduleNextTimerNotification(
          startTime,
          displayTitleRef.current,
        );
        if (cancelled || boundaryMs == null) return;

        // Only claim when the boundary changes — avoids a mutation on
        // every 60s poll while the same next-boundary is still pending.
        if (claimedBoundaryRef.current !== boundaryMs) {
          claimedBoundaryRef.current = boundaryMs;
          await claimLocalDelivery({ boundaryMs });
        }

        if (!registeredTokenRef.current) {
          registeredTokenRef.current = true;
          await registerPushToken(registerToken);
        }
      } catch (err) {
        console.warn("TimerNotifications: scheduling failed:", err);
      }
    };

    void sync();

    // Keep the single pending schedule current while the timer runs:
    // after the scheduled boundary fires (or time advances past it),
    // arm the next one. Also refresh when returning to the foreground.
    const intervalId = setInterval(() => {
      void sync();
    }, RESCHEDULE_POLL_MS);
    const appSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      appSub.remove();
    };
  }, [startTime, claimLocalDelivery, registerToken]);

  return null;
}
