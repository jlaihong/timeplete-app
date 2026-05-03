import Constants from "expo-constants";

function fromExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const v = extra?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/**
 * Convex URLs resolved in `app.config.js` (`expo.extra`), including loopback port
 * discovery when `.env.local` is stale vs the running Convex binary.
 *
 * **Prefer `expo.extra` before `process.env`:** Expo serializes dynamic config into
 * `Constants.expoConfig.extra`. Metro’s Babel pass also replaces
 * `process.env.EXPO_PUBLIC_*` with string literals — those come from `.env.local` alone and
 * can disagree with what `app.config.js` concluded (discovery / blind fallback). Better Auth +
 * Convex then hit the wrong port → `"Failed to fetch"`.
 *
 * Fallback to `process.env` for setups that omit `extra` (unusual).
 */
export function getExpoPublicConvexUrl(): string | undefined {
  const fromExtraVal = fromExtra("EXPO_PUBLIC_CONVEX_URL");
  const env =
    typeof process !== "undefined" ? process.env.EXPO_PUBLIC_CONVEX_URL : undefined;
  return (
    fromExtraVal?.trim() ||
    env?.trim() ||
    undefined
  );
}

/** HTTP site URL for Better Auth (same source as EXPO_PUBLIC_CONVEX_SITE_URL). */
export function getExpoPublicConvexSiteUrl(): string | undefined {
  const fromExtraVal = fromExtra("EXPO_PUBLIC_CONVEX_SITE_URL");
  const env =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_CONVEX_SITE_URL
      : undefined;

  return (
    fromExtraVal?.trim() ||
    env?.trim() ||
    undefined
  );
}
