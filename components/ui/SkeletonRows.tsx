import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Colors } from "../../constants/colors";
import { Radius } from "../../theme/tokens";

interface SkeletonRowsProps {
  /** Number of placeholder blocks. */
  count?: number;
  /** Height of each block — roughly the content it stands in for. */
  rowHeight?: number;
  accessibilityLabel?: string;
  /** No padding of its own, for a parent that already pads. */
  flush?: boolean;
}

/**
 * Placeholder blocks shown while a list loads. Keeps the column's shape so
 * content fills in without the layout jumping, instead of a spinner or a
 * "Loading…" line.
 */
export function SkeletonRows({
  count = 5,
  rowHeight = 44,
  accessibilityLabel = "Loading",
  flush = false,
}: SkeletonRowsProps) {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.9,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.45,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <View
      style={[styles.container, flush && styles.flush]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
    >
      {Array.from({ length: count }, (_, i) => (
        <Animated.View
          key={i}
          style={[styles.row, { height: rowHeight, opacity }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  flush: { padding: 0 },
  row: {
    borderRadius: Radius.lg,
    backgroundColor: Colors.surfaceContainer,
  },
});
