import { Platform } from "react-native";
import { router } from "expo-router";
import { expoHrefToBrowserPath } from "./syncBrowserHistory";

/**
 * Go to a page. On the web, holding Cmd/Ctrl (or middle-clicking) opens
 * it in a new tab, like the sidebar.
 */
export function openPage(
  pageId: string,
  event?: { metaKey?: boolean; ctrlKey?: boolean; button?: number } | null,
) {
  const href = `/(app)/pages/${pageId}`;
  if (
    Platform.OS === "web" &&
    event &&
    (event.metaKey || event.ctrlKey || event.button === 1)
  ) {
    window.open(expoHrefToBrowserPath(href), "_blank");
    return;
  }
  router.push(href as never);
}
