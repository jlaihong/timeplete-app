import React, { useMemo, useRef } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { CompleteCheckIcon } from "./CompleteCheckIcon";

/**
 * The round "complete" checkbox on a task row.
 *
 * It is a native tap gesture rather than a pressable. The row sits inside
 * a swipeable and a draggable list, so a JS touchable waits on those pans
 * before it responds; and gesture-handler's own `Pressable`, used here
 * before, dropped quick taps on iOS — a tap shorter than roughly 150ms
 * did nothing, so checking a task off often took two or three tries. A
 * tap gesture recognises the touch on release, however short.
 */
export function TaskCheckButton({
  checked,
  onPress,
  size = 22,
  style,
}: {
  checked: boolean;
  onPress: () => void;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // The gesture is built once; it reads the latest handler through a ref.
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .runOnJS(true)
        // A slow, deliberate press should still count.
        .maxDuration(2000)
        .hitSlop(8)
        .onEnd((_event, success) => {
          if (success) onPressRef.current();
        }),
    [],
  );

  return (
    <GestureDetector gesture={tap}>
      <View
        style={style}
        accessible
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        accessibilityLabel={checked ? "Mark incomplete" : "Mark complete"}
        // VoiceOver / TalkBack activate through this, not the gesture.
        onAccessibilityTap={() => onPressRef.current()}
      >
        <CompleteCheckIcon checked={checked} size={size} />
      </View>
    </GestureDetector>
  );
}
