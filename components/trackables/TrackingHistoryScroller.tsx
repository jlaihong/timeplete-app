import { ScrollView, type ScrollViewProps } from "react-native";

/**
 * Edit Trackable — Tracking history / Time Tracked tab.
 *
 * Uses `ScrollView` on all platforms (see removed raw `<div>` scroll host; RN-web
 * must scroll through `ScrollView`). On web, `TrackingHistoryScroller.web.tsx`
 * adds `data-tracking-history-scroll` for persistent scrollbar theming.
 */
export function TrackingHistoryScroller(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
