import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useTimer } from "../../hooks/useTimer";

export function TimerDisplay() {
  const timer = useTimer();

  if (!timer.isRunning) return null;

  const hours = Math.floor(timer.elapsed / 3600);
  const minutes = Math.floor((timer.elapsed % 3600) / 60);
  const seconds = timer.elapsed % 60;

  const display = hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;

  return (
    <View style={styles.container}>
      <View style={styles.indicator} />
      <Ionicons name="timer" size={18} color={Colors.white} />
      <Text style={styles.time}>{display}</Text>
      <TouchableOpacity
        style={styles.stopButton}
        onPress={() => timer.stop()}
      >
        <Ionicons name="stop" size={16} color={Colors.error} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.error,
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  time: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    flex: 1,
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
