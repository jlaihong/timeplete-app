import { ScrollView, type ScrollViewProps } from "react-native";

/**
 * Edit Trackable — Tracking history / Time Tracked tab.
 *
 * Previously, web used a raw `<div overflow: auto>` (see removed `.web.tsx`) to tweak
 * scrollbar theming, but RN-web lays out `View`/`Text` subtrees incorrectly inside
 * that host, yielding a phantom scrollbar with no visible rows. `ScrollView` is the
 * supported scroll container on all platforms.
 */
export function TrackingHistoryScroller(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
