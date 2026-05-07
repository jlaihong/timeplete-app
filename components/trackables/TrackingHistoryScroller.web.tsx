import { ScrollView, type ScrollViewProps } from "react-native";

type ScrollViewWebProps = ScrollViewProps & {
  dataSet?: Record<string, string | boolean | number | null | undefined>;
};

/**
 * Web: tag the RN-web scroll host so `webScrollbarStyles` can apply persistent,
 * visible scrollbar chrome (global non-mac rules hide thumbs until hover).
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
