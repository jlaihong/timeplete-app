/**
 * Web half of long-running-timer reminders. Expo push can't reach
 * browsers, so while a Timeplete tab is open (even in the background)
 * this fires Notification-API alerts when the running timer crosses a
 * 2h boundary. Notifications only fire when the tab is HIDDEN — when
 * it's visible the TimerCheckInGate popup is already on screen.
 *
 * Closed-tab web push (service worker + VAPID) is intentionally out of
 * scope for now.
 */
import { useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "../../hooks/useAuth";

const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const POLL_MS = 30_000;

/** Highest boundary already notified for this timer run, per tab. */
let notifiedUpToMs = 0;
let notifiedForStartTime: number | null = null;

export function TimerNotifications() {
  const { profileReady } = useAuth();
  const timer = useQuery(api.timers.get, profileReady ? {} : "skip");
  const startTime = timer?.startTime ?? null;
  const displayTitle = timer?.displayTitle ?? "Timer";

  useEffect(() => {
    if (startTime == null) return;
    if (typeof Notification === "undefined") return;

    if (notifiedForStartTime !== startTime) {
      notifiedForStartTime = startTime;
      // Don't replay boundaries that passed before this tab saw the
      // timer (e.g. page loaded 5h into a run).
      notifiedUpToMs =
        Math.floor((Date.now() - startTime) / CHECK_IN_INTERVAL_MS) *
        CHECK_IN_INTERVAL_MS;
    }

    if (Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const check = () => {
      if (Notification.permission !== "granted") return;
      // Visible tab → the in-app popup handles it.
      if (!document.hidden) return;
      const boundary =
        Math.floor((Date.now() - startTime) / CHECK_IN_INTERVAL_MS) *
        CHECK_IN_INTERVAL_MS;
      if (boundary < CHECK_IN_INTERVAL_MS || boundary <= notifiedUpToMs) {
        return;
      }
      notifiedUpToMs = boundary;
      const hours = Math.round(boundary / 3_600_000);
      try {
        new Notification("Timer still running", {
          body: `"${displayTitle}" has been running for ${hours} hours. Still working on it?`,
          tag: "timeplete-timer-check-in",
        });
      } catch (err) {
        console.warn("TimerNotifications(web): failed to notify:", err);
      }
    };

    check();
    const id = setInterval(check, POLL_MS);
    return () => clearInterval(id);
  }, [startTime, displayTitle]);

  return null;
}
