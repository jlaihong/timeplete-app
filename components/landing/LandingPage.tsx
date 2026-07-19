import React from "react";
import { Redirect } from "expo-router";

/** Native apps skip the marketing landing page and go straight to login. */
export function LandingPage() {
  return <Redirect href="/(auth)/login" />;
}
