import React from "react";
import { Text, type StyleProp, type TextStyle } from "react-native";
import { useTimerElapsed } from "../../hooks/useTimer";

/**
 * Leaf text node that re-renders once per second with a live elapsed
 * duration. This exists so the 1-second tick stays INSIDE this tiny
 * component — parent screens render it once and are untouched by the
 * tick (see the note on `useTimerElapsed`).
 */
export function LiveElapsedText({
  startTime,
  baseSeconds = 0,
  format,
  style,
}: {
  /** Epoch ms the timer started at (from `useTimer().startTime`). */
  startTime: number | null;
  /** Added to the live elapsed seconds (e.g. previously logged time). */
  baseSeconds?: number;
  format: (totalSeconds: number) => string;
  style?: StyleProp<TextStyle>;
}) {
  const elapsed = useTimerElapsed(startTime);
  return <Text style={style}>{format(baseSeconds + elapsed)}</Text>;
}
