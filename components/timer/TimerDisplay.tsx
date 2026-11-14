import { FontSize, Radius } from "../../theme/tokens";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useTimer } from "../../hooks/useTimer";
import { LiveElapsedText } from "./LiveElapsedText";
import { TaskDetailSheet } from "../tasks/TaskDetailSheet";
import type { Id } from "../../convex/_generated/dataModel";

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

  /** Task whose details were opened by tapping the bar. */
  const [openTaskId, setOpenTaskId] = useState<Id<"tasks"> | null>(null);

  const sheet = openTaskId ? (
    <TaskDetailSheet taskId={openTaskId} onClose={() => setOpenTaskId(null)} />
  ) : null;

  if (!timer.isRunning) return sheet;

  const taskId = timer.taskId as Id<"tasks"> | null;

  return (
    <>
      <View style={[styles.container, { paddingTop: 6 + insets.top }]}>
        {/* The bar is the way back to what is being timed: tapping it
            opens the running task. (A trackable timer has no task.) */}
        <Pressable
          style={styles.main}
          disabled={!taskId}
          onPress={() => taskId && setOpenTaskId(taskId)}
          accessibilityRole={taskId ? "button" : undefined}
          accessibilityLabel={
            taskId
              ? `Timer running on ${timer.displayTitle ?? "task"}. Open task`
              : undefined
          }
        >
          <View style={styles.indicator} />
          <Ionicons name="timer" size={18} color={Colors.primary} />
          {/* Task / trackable name so it's clear what is being tracked.
              Truncates so the elapsed time and stop button never get
              pushed off-screen by a long name. */}
          <Text style={styles.title} numberOfLines={1}>
            {timer.displayTitle ?? ""}
          </Text>
          {/* Leaf component owns the 1s tick — this bar renders once. */}
          <LiveElapsedText
            startTime={timer.startTime}
            format={formatClock}
            style={styles.time}
          />
        </Pressable>
        <TouchableOpacity
          style={styles.stopButton}
          onPress={() => timer.stop()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Stop timer"
        >
          <Ionicons name="stop" size={16} color={Colors.onPrimary} />
        </TouchableOpacity>
      </View>
      {sheet}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accentWash,
    paddingVertical: 6,
    paddingHorizontal: 16,
    gap: 8,
  },
  main: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
  },
  // Name fills the row (and truncates); the time keeps its intrinsic
  // width so the ticking digits stay put next to the stop button.
  title: {
    flex: 1,
    color: Colors.text,
    fontSize: FontSize.body,
    fontWeight: "600",
  },
  time: {
    color: Colors.text,
    fontSize: FontSize.bodyLarge,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  stopButton: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
});
