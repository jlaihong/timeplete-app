import React from "react";
import { Redirect } from "expo-router";

/**
 * Back-compat route: productivity-one's post-login destination was `/home`.
 * Bookmarks, Cognito redirects, and browser history still land here after the
 * cutover — send them to the Expo home tabs.
 */
export default function HomeRedirectScreen() {
  return <Redirect href="/(app)/(tabs)" />;
}
