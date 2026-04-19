import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../constants/colors";
import { useTimer } from "../../../../hooks/useTimer";
import { Id } from "../../../../convex/_generated/dataModel";
import { secondsToHhmm } from "../../../../lib/dates";

interface WidgetTimerRowProps {
  trackableId: Id<"trackables">;
}

/**
 * Mirror of productivity-one's timer row inside `goal-widget` — a single
 * play/pause button that toggles `useTimer.startForTrackable` / `stop`, with
 * a `HH:MM:SS` elapsed display next to it when ticking.
 */
export function WidgetTimerRow({ trackableId }: WidgetTimerRowProps) {
  const timer = useTimer();
  const ticking = timer.isRunning && timer.trackableId === trackableId;

  const onPress = async () => {
    if (ticking) {
      await timer.stop();
    } else {
      // startTrackableTimer atomically finalizes any other ticking timer,
      // so we never have to call stop() before switching.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await timer.startForTrackable(trackableId, tz);
    }
  };

  return (
    <View style={styles.row}>
      <TouchableOpacity
        style={[styles.btn, ticking && styles.btnTicking]}
        onPress={onPress}
        accessibilityLabel={ticking ? "Pause timer" : "Start timer"}
      >
        <Ionicons
          name={ticking ? "pause" : "play"}
          size={16}
          color={ticking ? Colors.onPrimary : Colors.text}
        />
      </TouchableOpacity>
      {ticking && (
        <Text style={styles.display}>
          {secondsToHhmm(timer.elapsed, true)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHighest,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  btnTicking: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  display: {
    fontFamily: "Courier",
    fontSize: 14,
    fontWeight: "600",
    color: Colors.text,
  },
});
