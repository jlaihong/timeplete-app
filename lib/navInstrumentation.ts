/**
 * Sidebar / route-transition tracing for measuring click → router → pathname → paint.
 *
 * Enable with `EXPO_PUBLIC_NAV_TRACE=1` (Expo embeds at build time) or at runtime on web:
 *   `window.__TIMELETE_NAV_TRACE__ = true` then reload.
 *
 * Console prefix: `[nav-trace]` — copy timestamps into a spreadsheet or compare runs.
 */

declare global {
  interface Window {
    __TIMELETE_NAV_TRACE__?: boolean;
  }
}

export function isNavTraceEnabled(): boolean {
  if (typeof process !== "undefined") {
    const env = process.env?.EXPO_PUBLIC_NAV_TRACE;
    if (env === "1" || env === "true") return true;
  }
  if (typeof window !== "undefined" && window.__TIMELETE_NAV_TRACE__) return true;
  return false;
}

type NavTracePhase =
  | "sidebar_click"
  | "router_dispatched"
  | "pathname_committed"
  | "after_paint_2x_raf"
  | "screen_mount";

type NavTraceEvent = {
  phase: NavTracePhase;
  t: number;
  deltaMs?: number;
  hrefOrPath?: string;
  prevPath?: string;
  note?: string;
};

const recent: NavTraceEvent[] = [];
const MAX = 60;

let clickSequence = 0;

function nextSeq(): number {
  clickSequence += 1;
  return clickSequence;
}

let lastClickT: number | null = null;
let longTaskObserver: PerformanceObserver | null = null;

function push(ev: NavTraceEvent) {
  if (!isNavTraceEnabled()) return;
  recent.push(ev);
  if (recent.length > MAX) recent.shift();
  const d =
    ev.deltaMs !== undefined ? ` Δ=${ev.deltaMs.toFixed(2)}ms` : "";
  const path =
    ev.hrefOrPath !== undefined ? ` path=${ev.hrefOrPath}` : "";
  const prev =
    ev.prevPath !== undefined ? ` prev=${ev.prevPath}` : "";
  const note = ev.note ? ` ${ev.note}` : "";
  console.log(
    `[nav-trace] ${ev.phase} @ ${ev.t.toFixed(2)}ms${d}${path}${prev}${note}`,
  );
}

/**
 * Start of sidebar handler (before router). Returns monotonic seq; use for
 * `logRouterInvoked` / `traceSidebarClickFlushComplete`.
 */
export function traceSidebarClick(href: string): number {
  if (!isNavTraceEnabled()) return 0;
  const seq = nextSeq();
  const t = performance.now();
  lastClickT = t;
  console.time(`[nav-trace] sidebar seq=${seq} click→router→flush`);
  console.log(
    `[nav-trace] CLICK_START seq=${seq} href=${href} t=${t.toFixed(2)}`,
  );
  push({ phase: "sidebar_click", t, hrefOrPath: href });
  return seq;
}

export function logRouterInvoked(seq: number, method: string) {
  if (!isNavTraceEnabled() || seq === 0) return;
  console.log(
    `[nav-trace] ROUTER_CALLED seq=${seq} ${method} t=${performance.now().toFixed(2)}`,
  );
}

/** After `flushExpoRouterNavigationQueue` in the same task as the click. */
export function traceSidebarClickFlushComplete(seq: number) {
  if (!isNavTraceEnabled() || seq === 0) return;
  if (typeof window !== "undefined" && window.location) {
    console.log(
      `[nav-trace] URL_AFTER_FLUSH seq=${seq} path=${window.location.pathname}${window.location.search} t=${performance.now().toFixed(2)}`,
    );
  }
  console.timeEnd(`[nav-trace] sidebar seq=${seq} click→router→flush`);
}

/** Immediately after router.navigate / replace (enqueue only if not flushed). */
export function traceRouterDispatched(
  method: "navigate" | "replace",
  href: string,
) {
  if (!isNavTraceEnabled()) return;
  const t = performance.now();
  push({
    phase: "router_dispatched",
    t,
    deltaMs: lastClickT !== null ? t - lastClickT : undefined,
    hrefOrPath: href,
    note: method,
  });
}

/** When usePathname()-driven effect sees a new path. */
export function tracePathnameCommitted(path: string, prevPath: string) {
  if (!isNavTraceEnabled()) return;
  const t = performance.now();
  push({
    phase: "pathname_committed",
    t,
    deltaMs: lastClickT !== null ? t - lastClickT : undefined,
    hrefOrPath: path,
    prevPath,
  });
}

/** Second rAF — typically after compositor has presented the frame. */
export function traceAfterPaint(path: string) {
  if (!isNavTraceEnabled()) return;
  const t = performance.now();
  push({
    phase: "after_paint_2x_raf",
    t,
    deltaMs: lastClickT !== null ? t - lastClickT : undefined,
    hrefOrPath: path,
  });
}

/** First useEffect in a destination screen (post-commit). */
export function traceScreenMount(screenId: string) {
  if (!isNavTraceEnabled()) return;
  const t = performance.now();
  push({
    phase: "screen_mount",
    t,
    deltaMs: lastClickT !== null ? t - lastClickT : undefined,
    note: screenId,
  });
}

/** Optional: log Long Task API entries (Chromium). */
export function installLongTaskLogger() {
  if (!isNavTraceEnabled()) return () => {};
  if (typeof PerformanceObserver === "undefined")
    return () => {};
  if (longTaskObserver) return () => {};
  try {
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        console.warn(
          `[nav-trace] longtask duration=${e.duration.toFixed(1)}ms start=${e.startTime.toFixed(1)}`,
        );
      }
    });
    obs.observe({ entryTypes: ["longtask"] as const });
    longTaskObserver = obs;
    return () => {
      obs.disconnect();
      longTaskObserver = null;
    };
  } catch {
    return () => {};
  }
}

export function getRecentNavTraceEvents(): readonly NavTraceEvent[] {
  return recent;
}
