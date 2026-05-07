import { ScrollView, type ScrollViewProps } from "react-native";

type ScrollViewWebProps = ScrollViewProps & {
  dataSet?: Record<string, string | boolean | number | null | undefined>;
};

/**
 * Web: set `data-tracking-history-scroll` on the **ScrollViewBase** host so
 * `installWebScrollbarStyles` can exclude it from app-wide translucent-thumb
 * rules (see `TRACKING_HISTORY_EXCLUDED` in `webScrollbarStyles.ts`).
 */
export function TrackingHistoryScroller(props: ScrollViewProps) {
  const { dataSet, ...rest } = props as ScrollViewWebProps;
  return (
    <ScrollView
      {...rest}
      dataSet={{ ...dataSet, trackingHistoryScroll: "true" }}
    />
  );
}
