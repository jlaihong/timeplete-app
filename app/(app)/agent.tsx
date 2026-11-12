import React from "react";
import { Redirect } from "expo-router";

/**
 * Agent access is now a section of Settings. This route stays so old
 * bookmarks and links still land in the right place.
 */
export default function AgentAccessRedirect() {
  return <Redirect href="/(app)/settings" />;
}
