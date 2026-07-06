import React, { StrictMode, useEffect } from "react";
import { LogBox, Platform } from "react-native";
import { Slot } from "expo-router";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StatusBar } from "expo-status-bar";
import {
  KeyboardProvider,
  KeyboardToolbar,
} from "react-native-keyboard-controller";
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

  // Keyboard controller wraps the whole app to publish keyboard height events
  // (used by `KeyboardAwareScrollView`) and provides the sticky
  // `KeyboardToolbar` that renders Previous / Next / Done buttons above the
  // software keyboard on iOS/Android. On web it's a no-op — the browser
  // handles focus navigation via Tab, and there's no software keyboard for
  // desktop, so we skip both components entirely.
  const useKeyboardHelpers = Platform.OS !== "web";

  const appTree = (
    <StrictMode>
      <ConvexProvider client={convex}>
        <ConvexBetterAuthProvider client={convex} authClient={authClient}>
          <StatusBar style="light" />
          <Slot />
        </ConvexBetterAuthProvider>
      </ConvexProvider>
    </StrictMode>
  );

  if (!useKeyboardHelpers) {
    return appTree;
  }

  return (
    <KeyboardProvider>
      {appTree}
      <KeyboardToolbar />
    </KeyboardProvider>
  );
}
