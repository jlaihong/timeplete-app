import { ScrollView, type ScrollViewProps } from "react-native";

/** Native ScrollView parity for Edit Trackable → Tracking history (web uses `.web.tsx` DOM scroll). */
export function TrackingHistoryScroller(props: ScrollViewProps) {
  return <ScrollView {...props} />;
}
