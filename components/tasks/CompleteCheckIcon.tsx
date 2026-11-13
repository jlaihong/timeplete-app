import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

/**
 * The task checkbox icon. When it goes from open to done it pops (a quick
 * scale up and back), so completing a task is visibly acknowledged.
 */
export function CompleteCheckIcon({
  checked,
  size = 22,
  uncheckedColor = Colors.textTertiary,
}: {
  checked: boolean;
  size?: number;
  uncheckedColor?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const wasChecked = useRef(checked);

  useEffect(() => {
    if (checked && !wasChecked.current) {
      scale.setValue(0.6);
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.35,
          duration: 90,
          easing: Easing.out(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 90,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
    wasChecked.current = checked;
  }, [checked, scale]);

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Ionicons
        name={checked ? "checkmark-circle" : "ellipse-outline"}
        size={size}
        color={checked ? Colors.success : uncheckedColor}
      />
    </Animated.View>
  );
}
