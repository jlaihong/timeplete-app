/**
 * Native half of long-running-timer reminders. Mounted once in the (app)
 * layout next to TimerCheckInGate; renders nothing.
 *
 * Two delivery paths, in order of preference:
 *
 *  1. LOCAL scheduled notifications (this file, no credentials needed).
 *     While a timer runs, the device schedules one notification per
 *     remaining 2h boundary (2h ... 22h) plus the 24h auto-stop notice,
 *     then calls `timers.claimLocalNotificationDelivery` so the server
 *     cron doesn't send remote duplicates. Cancelled + rescheduled when
 *     the timer starts/stops/adjusts.
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
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../../hooks/useAuth";

const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const AUTO_STOP_MS = 24 * 60 * 60 * 1000;

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

async function scheduleTimerNotifications(
  startTime: number,
  displayTitle: string,
): Promise<void> {
  const now = Date.now();
  for (
    let boundary = CHECK_IN_INTERVAL_MS;
    boundary < AUTO_STOP_MS;
    boundary += CHECK_IN_INTERVAL_MS
  ) {
    const fireAt = startTime + boundary;
    if (fireAt <= now) continue;
    const hours = Math.round(boundary / 3_600_000);
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Timer still running",
        body: `"${displayTitle}" has been running for ${hours} hours. Still working on it?`,
        sound: "default",
        data: { type: "timer-check-in" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(fireAt),
        channelId: Platform.OS === "android" ? "timer-reminders" : undefined,
      },
    });
  }
  const autoStopAt = startTime + AUTO_STOP_MS;
  if (autoStopAt > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Timer stopped after 24 hours",
        body: `"${displayTitle}" hit the 24-hour limit and was stopped. Open Timeplete to log the time you actually worked.`,
        sound: "default",
        data: { type: "timer-auto-stop" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(autoStopAt),
        channelId: Platform.OS === "android" ? "timer-reminders" : undefined,
      },
    });
  }
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

  useEffect(() => {
    // undefined = query still loading; don't cancel schedules yet.
    if (startTime === undefined) return;

    let cancelled = false;
    void (async () => {
      try {
        if (startTime === null) {
          await cancelTimerNotifications();
          return;
        }
        const granted = await ensurePermission();
        if (!granted || cancelled) return;
        await ensureAndroidChannel();
        // Reschedule from scratch on every startTime change (start or
        // adjust) so the boundaries always match the current run.
        await cancelTimerNotifications();
        if (cancelled) return;
        await scheduleTimerNotifications(startTime, displayTitle);
        await claimLocalDelivery({});
        if (!registeredTokenRef.current) {
          registeredTokenRef.current = true;
          await registerPushToken(registerToken);
        }
      } catch (err) {
        console.warn("TimerNotifications: scheduling failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
    // displayTitle intentionally excluded: a rename mid-run isn't worth a
    // full reschedule; the next start/adjust picks it up.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, claimLocalDelivery, registerToken]);

  return null;
}
