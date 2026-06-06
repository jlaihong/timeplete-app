import React, { StrictMode, useEffect } from "react";
import { LogBox } from "react-native";
import { Slot } from "expo-router";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StatusBar } from "expo-status-bar";
import { authClient } from "@/lib/auth-client";
import { getExpoPublicConvexUrl } from "@/lib/convexEnv";
import { convexPublicUrlForClient } from "@/lib/convexPublicUrl";
import { installWebScrollbarStyles } from "@/lib/webScrollbarStyles";

/**
 * Silence React 19 StrictMode deprecation warnings emitted from inside
 * third-party libraries (`react-native-reanimated`, `@react-navigation/drawer`).
 * Both call `findNodeHandle` / `findHostInstance_DEPRECATED` internally; we
 * can't fix those call sites and they're noise that blocks the LogBox overlay
 * on every screen mount. Revisit once the libraries publish patches that
 * migrate to ref-based APIs.
 */
LogBox.ignoreLogs([
  /findNodeHandle is deprecated in StrictMode/,
  /findHostInstance_DEPRECATED is deprecated in StrictMode/,
]);

const convexUrl = convexPublicUrlForClient(getExpoPublicConvexUrl());
if (!convexUrl) {
  throw new Error(
    "EXPO_PUBLIC_CONVEX_URL is missing. Run `npx convex dev` once, restart Expo, or use app.config.js (reads .convex/local ports when .env.local is absent).",
  );
}

const convex = new ConvexReactClient(convexUrl, {
  unsavedChangesWarning: false,
});

export default function RootLayout() {
  useEffect(() => {
    return installWebScrollbarStyles();
  }, []);

  return (
    <StrictMode>
      <ConvexProvider client={convex}>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
          <StatusBar style="light" />
          <Slot />
        </ConvexBetterAuthProvider>
      </ConvexProvider>
    </StrictMode>
  );
}
