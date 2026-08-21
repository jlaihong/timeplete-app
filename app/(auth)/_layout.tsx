import React from "react";
import { Redirect, Stack, usePathname } from "expo-router";
import { useAuth } from "../../hooks/useAuth";

/**
 * Expo Router's initial screen for this group when the URL doesn't name one.
 * Individual routes (`/signup`, `/forgot-password`, …) still win from the URL.
 */
export const unstable_settings = {
  initialRouteName: "login",
};

function isAuthPath(pathname: string, slug: string): boolean {
  return pathname === `/${slug}` || pathname.endsWith(`/${slug}`);
}

function isUnverifiedUser(user: object): boolean {
  return (
    "emailVerified" in user &&
    (user as { emailVerified?: unknown }).emailVerified === false
  );
}

function emailFromUser(user: object): string {
  if (!("email" in user)) return "";
  return typeof user.email === "string" ? user.email : "";
}

export default function AuthLayout() {
  const pathname = usePathname();
  const { isAuthenticated, isLoading, isApproved, user } = useAuth();

  const isPendingApproval = isAuthPath(pathname, "pending-approval");
  const isVerifyEmail = isAuthPath(pathname, "verify-email");

  // Keep this Stack mounted through Convex/session bootstrap and tab
  // reconnects. Replacing it with a spinner remounts the navigator, and
  // Expo Router then falls back to Sign In — wiping Forgot Password,
  // Create Account, and the post-signup access-code screen.
  // The (app) layout uses the same rule for deep-linked tab URLs.

  if (!isLoading && isAuthenticated) {
    // Session cookie can appear before useSession hydrates `user`. Don't
    // send the user into the app (or bounce them to Sign In) in that gap.
    if (user != null) {
      if (isUnverifiedUser(user)) {
        if (!isVerifyEmail) {
          const email = emailFromUser(user);
          return (
            <Redirect
              href={
                email
                  ? {
                      pathname: "/(auth)/verify-email",
                      params: { email },
                    }
                  : "/(auth)/verify-email"
              }
            />
          );
        }
      } else if (!isApproved) {
        if (!isPendingApproval) {
          return <Redirect href="/(auth)/pending-approval" />;
        }
      } else {
        return <Redirect href="/(app)/(tabs)" />;
      }
    }
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
      }}
    />
  );
}
