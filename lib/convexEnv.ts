import Constants from "expo-constants";

function fromExtra(key: string): string | undefined {
  const extra = Constants.expoConfig?.extra as Record<string, unknown> | undefined;
  const v = extra?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

/** WebSocket / Convex deployment URL (same source as EXPO_PUBLIC_CONVEX_URL). */
export function getExpoPublicConvexUrl(): string | undefined {
  const env =
    typeof process !== "undefined" ? process.env.EXPO_PUBLIC_CONVEX_URL : undefined;
  return env?.trim() || fromExtra("EXPO_PUBLIC_CONVEX_URL");
}

/** HTTP site URL for Better Auth (same source as EXPO_PUBLIC_CONVEX_SITE_URL). */
export function getExpoPublicConvexSiteUrl(): string | undefined {
  const env =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_CONVEX_SITE_URL
      : undefined;
  return env?.trim() || fromExtra("EXPO_PUBLIC_CONVEX_SITE_URL");
}
