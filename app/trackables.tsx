import React from "react";
import { Redirect } from "expo-router";

/**
 * Back-compat route: productivity-one used `/trackables`; Expo uses `/goals`.
 */
export default function TrackablesRedirectScreen() {
  return <Redirect href="/(app)/(tabs)/goals" />;
}
