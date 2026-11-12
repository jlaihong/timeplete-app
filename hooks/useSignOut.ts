import { useCallback } from "react";
import { Alert, Platform } from "react-native";
import { router, useNavigationContainerRef } from "expo-router";
import { authClient } from "../lib/auth-client";
import { flushExpoRouterNavigationQueue } from "../lib/flushExpoRouterNavigationQueue";
import { replaceBrowserHistorySync } from "../lib/syncBrowserHistory";

/**
 * Sign out, after asking. Returns the function to call from a button.
 * The confirmation is here rather than at each call site so a stray click
 * never ends the session.
 */
export function useSignOut(): () => void {
  const navigationContainerRef = useNavigationContainerRef();

  const signOut = useCallback(async () => {
    await authClient.signOut();
    replaceBrowserHistorySync("/");
    router.replace("/");
    flushExpoRouterNavigationQueue(navigationContainerRef);
  }, [navigationContainerRef]);

  return useCallback(() => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      if (window.confirm("Sign out of Timeplete?")) void signOut();
      return;
    }
    Alert.alert("Sign out of Timeplete?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => void signOut() },
    ]);
  }, [signOut]);
}
