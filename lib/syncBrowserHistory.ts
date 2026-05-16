/**
 * Make sidebar/drawer URL changes feel instant on web.
 *
 * Why this exists:
 * - React Navigation's `useLinking` listener that calls
 *   `window.history.pushState` is wrapped in `series(onStateChange)`, which
 *   queues a microtask instead of running synchronously inside the dispatch.
 * - In React 18, the `useSyncExternalStore`-based store update scheduled by
 *   the same dispatch also runs as a microtask — and is queued *first* (it
 *   is registered as a listener before useLinking's effect runs). React
 *   therefore renders the new screen *before* `useLinking` updates the URL.
 * - Mounting/rendering the destination screen can easily take a few hundred
 *   milliseconds on a heavy desktop layout, which is exactly the lag the
 *   user perceives as "the sidebar is slow" — the URL bar visibly trails
 *   the click.
 *
 * Calling {@link pushBrowserHistorySync} (or {@link replaceBrowserHistorySync})
 * at the very top of a click handler updates the browser URL in the same
 * task as the click event, so the URL bar reflects the click immediately
 * regardless of how long the React render takes.
 *
 * To avoid duplicate history entries from React Navigation's later deferred
 * push, this module also installs (lazily, on first call) a one-time
 * monkey-patch of `window.history.pushState`. The patch keeps a small queue
 * of "expected" URLs that we just pushed manually; when React Navigation
 * fires its own `pushState` for one of those URLs the patch:
 *   - skips the call entirely if there are *more* expected pushes after it
 *     (intermediate state during a burst of rapid clicks — the browser URL
 *     has already advanced past this entry); or
 *   - converts the call to `replaceState` on the most recent push (capturing
 *     React Navigation's `{ id }` state object on the already-pushed entry,
 *     so back/forward continues to resolve through React Navigation's
 *     in-memory `items` array).
 *
 * On non-web platforms (no `window`) every function is a no-op.
 */

const PATCH_INSTALLED = Symbol.for("timeplete.syncHistoryPatchInstalled");

/**
 * How long a queued "expected RN push" stays armed. React Navigation drains
 * its `series` queue on the next microtask, so the real wait is sub-ms; this
 * timeout exists only so a swallowed dispatch (e.g. ref unmount, error in a
 * state listener) cannot poison future pushes from external code.
 */
const DEDUPE_TTL_MS = 1000;

type PendingDedupe = { url: string; expires: number };

let originalPushState: typeof window.history.pushState | null = null;
let originalReplaceState: typeof window.history.replaceState | null = null;
const pendingRNDedupes: PendingDedupe[] = [];

function normalize(url: string): string {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname + u.search + u.hash;
  } catch {
    return url;
  }
}

function currentPath(): string {
  return (
    window.location.pathname + window.location.search + window.location.hash
  );
}

function prunePendingDedupes(): void {
  const now = performance.now();
  while (
    pendingRNDedupes.length > 0 &&
    pendingRNDedupes[0]!.expires < now
  ) {
    pendingRNDedupes.shift();
  }
}

function installHistoryPatch(): void {
  if (typeof window === "undefined") return;
  const flagged = window as unknown as Record<symbol, boolean>;
  if (flagged[PATCH_INSTALLED]) return;

  originalPushState = window.history.pushState.bind(window.history);
  originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function patchedPushState(
    state: unknown,
    unused: string,
    url?: string | URL | null,
  ): void {
    prunePendingDedupes();
    const targetStr =
      typeof url === "string"
        ? url
        : url instanceof URL
          ? url.toString()
          : null;
    if (targetStr !== null) {
      const normalized = normalize(targetStr);
      const idx = pendingRNDedupes.findIndex((e) => e.url === normalized);
      if (idx >= 0) {
        pendingRNDedupes.splice(idx, 1);
        if (pendingRNDedupes.length === 0) {
          // Last expected dedupe: convert to replaceState so React
          // Navigation's `{ id }` state lands on the entry we already
          // pushed (URL is unchanged because target === current).
          originalReplaceState!(
            state as object,
            unused,
            url ?? null,
          );
          return;
        }
        // Intermediate dedupe (a burst of clicks is still draining):
        // drop the call entirely — the browser URL has already advanced
        // past this entry and recreating it would shove the URL backwards.
        return;
      }
    }
    originalPushState!(state as object, unused, url ?? null);
  };

  flagged[PATCH_INSTALLED] = true;
}

/**
 * Push `url` onto `window.history` immediately and arm a dedupe so React
 * Navigation's deferred `pushState` for the same URL is folded into a
 * `replaceState` on the same entry.
 *
 * Call this *before* invoking `router.navigate` / `router.push` inside a
 * click handler. No-ops on native / SSR.
 */
export function pushBrowserHistorySync(url: string): void {
  if (typeof window === "undefined") return;
  installHistoryPatch();

  const target = normalize(url);
  pendingRNDedupes.push({
    url: target,
    expires: performance.now() + DEDUPE_TTL_MS,
  });

  if (target === normalize(currentPath())) return;
  // Bypass our own patched pushState so the dedupe entry above is reserved
  // for React Navigation's later call, not consumed by us.
  originalPushState!(null, "", url);
}

/**
 * Replace the current `window.history` entry's URL immediately. Use this
 * instead of {@link pushBrowserHistorySync} when the corresponding router
 * call is `router.replace` (e.g. switching between sibling list/tab routes
 * via the drawer).
 */
export function replaceBrowserHistorySync(url: string): void {
  if (typeof window === "undefined") return;
  installHistoryPatch();

  const target = normalize(url);
  if (target === normalize(currentPath())) return;
  // React Navigation will also call replaceState for the same URL later;
  // both calls are idempotent for the current entry's URL, and the later
  // one (with `{ id }`) wins for state — exactly what we want.
  originalReplaceState!(null, "", url);
}

/**
 * Map an Expo Router `Href` like `/(app)/(tabs)/goals` to the real browser
 * URL React Navigation derives from state (`/goals`). Expo Router groups
 * wrapped in parens are layout-only and never appear in the URL.
 */
export function expoHrefToBrowserPath(href: string): string {
  const cleaned = href.replace(/\/\([^/)]+\)/g, "");
  if (cleaned === "") return "/";
  return cleaned;
}
