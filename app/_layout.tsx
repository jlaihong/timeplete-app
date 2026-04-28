import React, { StrictMode, useEffect } from "react";
import { Slot } from "expo-router";
import { ConvexReactClient, ConvexProvider } from "convex/react";
import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StatusBar } from "expo-status-bar";
import { authClient } from "@/lib/auth-client";
import { getExpoPublicConvexUrl } from "@/lib/convexEnv";
import { convexPublicUrlForClient } from "@/lib/convexPublicUrl";
import { installWebScrollbarStyles } from "@/lib/webScrollbarStyles";

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
    installWebScrollbarStyles();
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
