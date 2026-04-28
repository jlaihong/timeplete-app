import { Platform } from "react-native";

/**
 * `npx convex dev` writes `127.0.0.1` into `.env.local`. On Expo Web, the page
 * is usually `http://localhost:8081`, so requests to `http://127.0.0.1:3213`
 * cross two different “local” hostnames — browsers often block that (CORS /
 * Private Network Access) and the UI shows only “Failed to fetch”.
 *
 * On native, keep the URL from env unchanged (simulators/devices differ).
 */
export function convexPublicUrlForClient(url: string | undefined): string | undefined {
  if (!url || Platform.OS !== "web") return url;
  return url.replace(/127\.0\.0\.1/g, "localhost");
}
