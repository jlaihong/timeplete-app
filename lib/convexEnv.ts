import Constants from "expo-constants";
import { Platform } from "react-native";

function fromExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const v = extra?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Convex URLs resolved in `app.config.js` (`expo.extra`), including loopback port
 * discovery when `.env.local` is stale vs the running Convex binary.
 *
 * Prefer `extra` before `process.env`: Metro/Babel can inline literals from
 * `.env.local` that disagree with authoritative `app.config` output — Better
 * Auth then `fetch`es a closed port → "Failed to fetch".
 *
 * **Exception — Web:** Metro bundles a stale `extra` blob in `Constants` while Expo
 * CLI overlays `process.env` (HMR) from `app.config.js` discovery. Prefer `process.env`
 * on web first.
 */
export function getExpoPublicConvexUrl(): string | undefined {
  const fromExtraVal = fromExtra("EXPO_PUBLIC_CONVEX_URL");
  const env =
    typeof process !== "undefined" ? process.env.EXPO_PUBLIC_CONVEX_URL : undefined;

  const ex = fromExtraVal?.trim();
  const ev = env?.trim();
  if (Platform.OS === "web") {
    return ev || ex || undefined;
  }
  return ex || ev || undefined;
}

/** HTTP site URL for Better Auth (same source as EXPO_PUBLIC_CONVEX_SITE_URL). */
export function getExpoPublicConvexSiteUrl(): string | undefined {
  const fromExtraVal = fromExtra("EXPO_PUBLIC_CONVEX_SITE_URL");
  const env =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_CONVEX_SITE_URL
      : undefined;

  const ex = fromExtraVal?.trim();
  const ev = env?.trim();
  if (Platform.OS === "web") {
    return ev || ex || undefined;
  }
  return ex || ev || undefined;
}
