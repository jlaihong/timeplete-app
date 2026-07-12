import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Safety net for forgotten timers: anything running 24h+ is stopped and
// parked in `pendingTimerReviews` for the owner to review on next open.
// 15-minute cadence keeps the worst-case overshoot small relative to 24h.
crons.interval(
  "auto-stop 24h timers",
  { minutes: 15 },
  internal.timers.autoStopLongTimers,
  {},
);

export default crons;
