import { Platform } from "react-native";

/**
 * `npx convex dev` writes `127.0.0.1` into `.env.local`. On Expo Web, the page may load
 * from `http://localhost:<port>` while Convex URLs use `http://127.0.0.1:<port>` — or the
 * reverse. Browsers treat `localhost` vs `127.0.0.1` as different origins, which breaks
 * Better Auth `fetch` (CORS / Private Network Access / cookies) and surfaces as
 * `"Failed to fetch"`.
 *
 * When the SPA hostname is `localhost` or `127.0.0.1`, rewrite Convex loopback URLs to use
 * that same hostname so origin + API host stay aligned.
 */
export function convexPublicUrlForClient(url: string | undefined): string | undefined {
  if (!url || Platform.OS !== "web") return url;

  if (typeof window === "undefined" || !window.location?.hostname) {
    return url;
  }

  const pageHost = window.location.hostname;
  if (pageHost !== "localhost" && pageHost !== "127.0.0.1") {
    return url;
  }

  try {
    const u = new URL(url);
    if (u.hostname !== "127.0.0.1" && u.hostname !== "localhost") {
      return url;
    }
    u.hostname = pageHost;
    // `URL.toString()` normalizes an origin-only URL (no path) by adding `/`
    // — e.g. `new URL("http://x:3212").toString()` → `"http://x:3212/"`.
    // The Convex client builds its WS URI as `${origin}/api/<v>/sync`, so a
    // trailing `/` produces `ws://x:3212//api/<v>/sync` (double slash → 404
    // → infinite reconnect loop, login spinner forever). Strip it.
    return u.toString().replace(/\/+$/, "");
  } catch {
    return url;
  }
}
