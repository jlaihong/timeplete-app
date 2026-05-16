import React from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export type TimeSpendTimelineBlockProps = {
  accessibilityLabel: string;
  displayTitle: string;
  segmentTimeRangeLabel: string;
  style: StyleProp<ViewStyle>;
};

export function TimeSpendTimelineBlock({
  accessibilityLabel,
  style,
}: TimeSpendTimelineBlockProps) {
  return <View accessibilityLabel={accessibilityLabel} style={style} />;
}
