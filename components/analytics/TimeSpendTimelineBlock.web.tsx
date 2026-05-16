import React from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import type { CSSProperties } from "react";

export type TimeSpendTimelineBlockProps = {
  accessibilityLabel: string;
  hoverTip: string;
  style: StyleProp<ViewStyle>;
};

/**
 * `react-native-web` `View` does not forward arbitrary DOM attrs (`title`), so
 * calendar-style hover tooltips never appeared. Use a real `div` on web.
 */
export function TimeSpendTimelineBlock({
  accessibilityLabel,
  hoverTip,
  style,
}: TimeSpendTimelineBlockProps) {
  return (
    <div
      title={hoverTip}
      aria-label={accessibilityLabel}
      role="presentation"
      style={StyleSheet.flatten(style) as CSSProperties}
    />
  );
}
