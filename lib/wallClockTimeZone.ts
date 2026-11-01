/**
 * Single pipeline for calendar timers:
 *
 *   • Canonical instant: UTC epoch ms (`startTime` on taskTimers / derived for UI).
 *   • One IANA zone per timer row (`taskTimers.timeZone` / `timeWindows.timeZone`).
 *   • Wall-clock labels (YYYYMMDD + HH:MM) are always derived via
 *     `wallClockInTimeZone(epochMs, timeZone)` — never “re-localized” through
 *     the browser’s local `Date` constructor for the same semantic instant.
 *
 * Grid drag converts **calendar grid coordinates** (day column + minutes) → epoch
 * using `wallClockGridToEpochMs` in that **same** IANA zone so resize + pause
 * cannot drift.
 */

function normalizeTimeZone(timeZone: string): string {
  let tz = typeof timeZone === "string" ? timeZone.trim() : "";
  if (!tz) tz = "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz }).format(0);
  } catch {
    tz = "UTC";
  }
  return tz;
}

/** Sortable key: YYYYMMDD + zero-padded hour + minute (no colon). */
function wallClockSortKey(w: {
  startDayYYYYMMDD: string;
  startTimeHHMM: string;
}): string {
  const [h, m] = w.startTimeHHMM.split(":").map((x) => parseInt(x, 10));
  return `${w.startDayYYYYMMDD}${String(h).padStart(2, "0")}${String(m).padStart(2, "0")}`;
}

type WallClock = { startDayYYYYMMDD: string; startTimeHHMM: string };

/**
 * Most of B.C. stopped falling back on 2026-11-01 and stays on Pacific
 * time (UTC-7) year round. Runtimes whose tzdata still turns
 * `America/Vancouver` back to UTC-8 that morning are an hour early for
 * every later instant. Probe a known afternoon and correct only when
 * the runtime is still on the old rule, so an updated tzdata is left
 * alone and client and server agree either way.
 */
const BC_PERMANENT_PACIFIC_ZONES = new Set([
  "America/Vancouver",
  "Canada/Pacific",
]);
/** 2026-11-01 02:00 former PDT, the fallback that no longer happens. */
const BC_PERMANENT_PACIFIC_START_MS = Date.UTC(2026, 10, 1, 9, 0, 0);

let bcPacificTzdataFallsBack: boolean | undefined;

function bcRuntimeStillFallsBack(): boolean {
  if (bcPacificTzdataFallsBack !== undefined) return bcPacificTzdataFallsBack;
  // 16:00 UTC that day is 08:00 at UTC-8 and 09:00 at UTC-7.
  const probe = formatWallClockUnadjusted(
    Date.UTC(2026, 10, 1, 16, 0, 0),
    "America/Vancouver",
  );
  bcPacificTzdataFallsBack = probe.startTimeHHMM === "08:00";
  return bcPacificTzdataFallsBack;
}

function addOneCivilHour(wall: WallClock): WallClock {
  const y = parseInt(wall.startDayYYYYMMDD.slice(0, 4), 10);
  const mo = parseInt(wall.startDayYYYYMMDD.slice(4, 6), 10);
  const d = parseInt(wall.startDayYYYYMMDD.slice(6, 8), 10);
  const [hh, mm] = wall.startTimeHHMM.split(":").map((x) => parseInt(x, 10));
  const rolled = new Date(Date.UTC(y, mo - 1, d, hh + 1, mm, 0));
  const yyyy = rolled.getUTCFullYear().toString();
  const month = String(rolled.getUTCMonth() + 1).padStart(2, "0");
  const day = String(rolled.getUTCDate()).padStart(2, "0");
  const hour = String(rolled.getUTCHours()).padStart(2, "0");
  const minute = String(rolled.getUTCMinutes()).padStart(2, "0");
  return {
    startDayYYYYMMDD: `${yyyy}${month}${day}`,
    startTimeHHMM: `${hour}:${minute}`,
  };
}

function applyBcPermanentPacific(
  epochMs: number,
  timeZone: string,
  wall: WallClock,
): WallClock {
  if (epochMs < BC_PERMANENT_PACIFIC_START_MS) return wall;
  if (!BC_PERMANENT_PACIFIC_ZONES.has(timeZone)) return wall;
  if (!bcRuntimeStillFallsBack()) return wall;
  return addOneCivilHour(wall);
}

/**
 * Wall clock fields in an IANA timezone for a UTC instant.
 * Shared by Convex (`finalizeTimer`) and the client.
 */
function formatWallClockUnadjusted(
  epochMs: number,
  timeZone: string,
): WallClock {
  const tz = normalizeTimeZone(timeZone);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(new Date(epochMs));
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  const y = map.year ?? "1970";
  const mo = map.month ?? "01";
  const d = map.day ?? "01";
  let hour = map.hour ?? "00";
  const minute = map.minute ?? "00";
  if (hour === "24") hour = "00";
  return {
    startDayYYYYMMDD: `${y}${mo}${d}`,
    startTimeHHMM: `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`,
  };
}

export function wallClockInTimeZone(
  epochMs: number,
  timeZone: string,
): WallClock {
  const tz = normalizeTimeZone(timeZone);
  return applyBcPermanentPacific(
    epochMs,
    tz,
    formatWallClockUnadjusted(epochMs, tz),
  );
}

/**
 * Calendar grid: `selectedDay` (YYYYMMDD) + minutes since local midnight **in `timeZone`**
 * → UTC epoch ms. Uses the same IANA zone as `wallClockInTimeZone` / `taskTimers.timeZone`.
 *
 * Scans a ±40h window at 1-minute resolution (DST-safe enough; spring-forward gaps
 * may throw if the wall time does not exist).
 */
export function wallClockGridToEpochMs(
  dayYYYYMMDD: string,
  minutesFromMidnight: number,
  timeZone: string,
): number {
  const tz = normalizeTimeZone(timeZone);
  if (!/^\d{8}$/.test(dayYYYYMMDD)) {
    throw new Error("wallClockGridToEpochMs: invalid day");
  }
  const safeMin = Math.max(
    0,
    Math.min(24 * 60 - 1, Math.round(minutesFromMidnight)),
  );
  const y = parseInt(dayYYYYMMDD.slice(0, 4), 10);
  const mo = parseInt(dayYYYYMMDD.slice(4, 6), 10);
  const d = parseInt(dayYYYYMMDD.slice(6, 8), 10);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) {
    throw new Error("wallClockGridToEpochMs: invalid day parts");
  }

  const hh = Math.floor(safeMin / 60);
  const mm = safeMin % 60;
  const wantKey =
    dayYYYYMMDD +
    String(hh).padStart(2, "0") +
    String(mm).padStart(2, "0");

  const noonUtc = Date.UTC(y, mo - 1, d, 12, 0, 0);
  const windowMs = 40 * 3600000;
  const step = 60000;

  for (let t = noonUtc - windowMs; t <= noonUtc + windowMs; t += step) {
    if (wallClockSortKey(wallClockInTimeZone(t, tz)) === wantKey) {
      return t;
    }
  }

  throw new Error(
    `wallClockGridToEpochMs: no instant for ${dayYYYYMMDD} ${hh}:${String(mm).padStart(2, "0")} in ${tz} (spring-forward gap?)`,
  );
}
