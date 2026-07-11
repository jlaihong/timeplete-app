import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useTimer } from "../../hooks/useTimer";
import { LiveElapsedText } from "./LiveElapsedText";

function formatClock(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function TimerDisplay() {
  const timer = useTimer();
  // The app renders edge-to-edge on Android/iOS, so this bar — mounted at
  // the very top of the (app) layout — starts underneath the transparent
  // status bar. Pad by the top inset so the dot / time / stop button render
  // below the system icons while the teal background extends behind them.
  // (insets.top is 0 on web, so this is a no-op there.)
  const insets = useSafeAreaInsets();

  if (!timer.isRunning) return null;

  return (
    <View style={[styles.container, { paddingTop: 8 + insets.top }]}>
      <View style={styles.indicator} />
      <Ionicons name="timer" size={18} color={Colors.white} />
      {/* Task / trackable name so it's clear what is being tracked.
          Truncates so the elapsed time and stop button never get pushed
          off-screen by a long name. */}
      <Text style={styles.title} numberOfLines={1}>
        {timer.displayTitle ?? ""}
      </Text>
      {/* Leaf component owns the 1s tick — this bar renders once. */}
      <LiveElapsedText
        startTime={timer.startTime}
        format={formatClock}
        style={styles.time}
      />
      <TouchableOpacity
        style={styles.stopButton}
        onPress={() => timer.stop()}
      >
        <Ionicons name="stop" size={16} color={Colors.primaryDark} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.primaryDark,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
  // Name fills the row (and truncates); the time keeps its intrinsic
  // width so the ticking digits stay put next to the stop button.
  title: {
    flex: 1,
    color: Colors.white,
    fontSize: 14,
    fontWeight: "600",
  },
  time: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  stopButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
});
