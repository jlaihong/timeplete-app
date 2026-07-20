/**
 * Server half of long-running-timer reminders (see TimerCheckInGate for
 * the in-app half). A cron finds running timers that crossed a 2h
 * elapsed boundary (2h, 4h, ... 22h) without a reminder being sent yet,
 * and pushes to every Expo push token the owner registered. The 24h
 * boundary is not handled here — `timers.autoStopLongTimers` stops the
 * timer and schedules `sendAutoStopNotification` instead.
 *
 * `taskTimers.notifiedUpToMs` tracks the highest boundary a push was
 * SENT for, deliberately separate from `acknowledgedUpToMs` (the
 * boundary the user ANSWERED): a reminder must not repeat, but the
 * in-app popup keeps showing until the user responds.
 *
 * Delivery notes:
 *  - Native devices schedule ONLY the next 2h LOCAL notification
 *    (components/timer/TimerNotifications.tsx) and claim that boundary
 *    via `claimLocalNotificationDelivery({ boundaryMs })`, so this cron
 *    still covers later boundaries when the phone stays closed. Local
 *    scheduling works without push credentials. Remote push also covers
 *    timers started on the web when the phone app was never opened
 *    during the run.
 *  - Web browsers can't receive Expo pushes; the web client fires
 *    Notification-API notifications itself while a tab is open.
 */
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { resolveActiveTimerCalendarDisplay } from "./_helpers/activeTimerCalendarDisplay";
import { TIMER_AUTO_STOP_MS } from "./timers";

const CHECK_IN_INTERVAL_MS = 2 * 60 * 60 * 1000;

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound: "default";
  priority: "high";
  data: Record<string, string>;
}

/**
 * POST messages to Expo's push API (chunks of 100). Returns tokens Expo
 * reported as permanently dead (`DeviceNotRegistered`) so callers can
 * delete them. Other ticket errors (e.g. missing APNs credentials) are
 * logged and otherwise ignored — the in-app popup and local device
 * notifications still cover the user.
 */
async function sendExpoPushMessages(
  messages: ExpoPushMessage[],
): Promise<{ deadTokens: string[] }> {
  const deadTokens: string[] = [];
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(chunk),
      });
      const json: {
        data?: Array<{
          status: string;
          message?: string;
          details?: { error?: string };
        }>;
        errors?: unknown;
      } = await res.json();

      if (!res.ok || json.errors) {
        console.warn(
          JSON.stringify({
            tag: "timerNotifications.expoPush.requestFailed",
            httpStatus: res.status,
            errors: json.errors,
          }),
        );
        continue;
      }
      const tickets = json.data ?? [];
      tickets.forEach((ticket, idx) => {
        if (ticket.status === "ok") return;
        const token = chunk[idx]?.to;
        if (ticket.details?.error === "DeviceNotRegistered" && token) {
          deadTokens.push(token);
        }
        console.warn(
          JSON.stringify({
            tag: "timerNotifications.expoPush.ticketError",
            token,
            error: ticket.details?.error,
            message: ticket.message,
          }),
        );
      });
    } catch (err) {
      console.warn(
        JSON.stringify({
          tag: "timerNotifications.expoPush.fetchError",
          error: String(err),
        }),
      );
    }
  }
  return { deadTokens };
}

function reminderBody(displayTitle: string, boundaryMs: number): string {
  const hours = Math.round(boundaryMs / 3_600_000);
  return `"${displayTitle}" has been running for ${hours} hours. Still working on it?`;
}

/** Running timers past an un-notified 2h boundary, with the owner's push tokens. */
export const listDueReminders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due: Array<{
      timerId: Id<"taskTimers">;
      boundaryMs: number;
      displayTitle: string;
      tokens: string[];
    }> = [];

    const timers = await ctx.db.query("taskTimers").collect();
    for (const timer of timers) {
      const elapsed = now - timer.startTime;
      let boundary =
        Math.floor(elapsed / CHECK_IN_INTERVAL_MS) * CHECK_IN_INTERVAL_MS;
      // 24h messaging belongs to the auto-stop flow, not reminders.
      boundary = Math.min(boundary, TIMER_AUTO_STOP_MS - CHECK_IN_INTERVAL_MS);
      if (boundary < CHECK_IN_INTERVAL_MS) continue;
      if (boundary <= (timer.notifiedUpToMs ?? 0)) continue;

      const tokens = (
        await ctx.db
          .query("pushTokens")
          .withIndex("by_user", (q) => q.eq("userId", timer.userId))
          .collect()
      ).map((t) => t.token);
      if (tokens.length === 0) continue;

      const { displayTitle } = await resolveActiveTimerCalendarDisplay(
        ctx,
        timer.userId,
        timer,
      );
      due.push({
        timerId: timer._id,
        boundaryMs: boundary,
        displayTitle: displayTitle ?? "Timer",
        tokens,
      });
    }
    return due;
  },
});

/** Record sent boundaries + drop tokens Expo says are dead. */
export const finalizeReminders = internalMutation({
  args: {
    sent: v.array(
      v.object({ timerId: v.id("taskTimers"), boundaryMs: v.number() }),
    ),
    deadTokens: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const item of args.sent) {
      const timer = await ctx.db.get(item.timerId);
      if (!timer) continue; // stopped between query and now — fine
      if (item.boundaryMs <= (timer.notifiedUpToMs ?? 0)) continue;
      await ctx.db.patch(item.timerId, { notifiedUpToMs: item.boundaryMs });
    }
    for (const token of args.deadTokens) {
      const row = await ctx.db
        .query("pushTokens")
        .withIndex("by_token", (q) => q.eq("token", token))
        .first();
      if (row) await ctx.db.delete(row._id);
    }
    return null;
  },
});

/** Cron target: push "still working?" reminders for due 2h boundaries. */
export const sendDueReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const due = await ctx.runQuery(
      internal.timerNotifications.listDueReminders,
      {},
    );
    if (due.length === 0) return null;

    const messages: ExpoPushMessage[] = due.flatMap((d) =>
      d.tokens.map((token) => ({
        to: token,
        title: "Timer still running",
        body: reminderBody(d.displayTitle, d.boundaryMs),
        sound: "default" as const,
        priority: "high" as const,
        data: { type: "timer-check-in" },
      })),
    );
    console.log(
      JSON.stringify({
        tag: "timerNotifications.sendDueReminders",
        reminders: due.length,
        messages: messages.length,
      }),
    );
    const { deadTokens } = await sendExpoPushMessages(messages);
    await ctx.runMutation(internal.timerNotifications.finalizeReminders, {
      sent: due.map((d) => ({
        timerId: d.timerId,
        boundaryMs: d.boundaryMs,
      })),
      deadTokens,
    });
    return null;
  },
});

export const listUserTokens = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("pushTokens")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows.map((r) => r.token);
  },
});

/** Scheduled by `timers.autoStopLongTimers` right after parking a timer. */
export const sendAutoStopNotification = internalAction({
  args: { userId: v.id("users"), displayTitle: v.string() },
  handler: async (ctx, args) => {
    const tokens = await ctx.runQuery(
      internal.timerNotifications.listUserTokens,
      { userId: args.userId },
    );
    if (tokens.length === 0) return null;
    const { deadTokens } = await sendExpoPushMessages(
      tokens.map((token) => ({
        to: token,
        title: "Timer stopped after 24 hours",
        body: `"${args.displayTitle}" hit the 24-hour limit and was stopped. Open Timeplete to log the time you actually worked.`,
        sound: "default" as const,
        priority: "high" as const,
        data: { type: "timer-auto-stop" },
      })),
    );
    if (deadTokens.length > 0) {
      await ctx.runMutation(internal.timerNotifications.finalizeReminders, {
        sent: [],
        deadTokens,
      });
    }
    return null;
  },
});
