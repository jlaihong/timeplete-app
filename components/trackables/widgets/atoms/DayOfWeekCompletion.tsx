import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Colors } from "../../../../constants/colors";
import { getDayOfWeekLetter, todayYYYYMMDD } from "../../../../lib/dates";

export interface DayCompletionEntry {
  dayYYYYMMDD: string;
  numCompleted: number;
}

interface DayOfWeekCompletionProps {
  /** 7 entries Mon..Sun for the current week. */
  days: DayCompletionEntry[];
  colour: string;
  /** Called when the user taps a single day segment. */
  onDayPress: (dayYYYYMMDD: string) => void;
}

/**
 * Mirror of productivity-one's `<app-day-of-week-completion-widget>`.
 * Renders a 7-segment pill (Mon..Sun) with the day-letter, applying a filled
 * style when the day is completed (`numCompleted > 0`).
 *
 * Tapping a segment opens the per-type quick-log dialog for that day.
 */
export function DayOfWeekCompletion({
  days,
  colour,
  onDayPress,
}: DayOfWeekCompletionProps) {
  const today = todayYYYYMMDD();
  return (
    <View style={styles.pill} accessibilityLabel="Week completion">
      {days.map((d) => {
        const isComplete = d.numCompleted > 0;
        const isToday = d.dayYYYYMMDD === today;
        return (
          <TouchableOpacity
            key={d.dayYYYYMMDD}
            style={[
              styles.segment,
              isComplete && {
                backgroundColor: colour,
                borderColor: colour,
              },
              isToday && !isComplete && styles.segmentToday,
            ]}
            onPress={() => onDayPress(d.dayYYYYMMDD)}
            accessibilityLabel={`${getDayOfWeekLetter(d.dayYYYYMMDD)} ${
              isComplete ? "completed" : "not completed"
            }`}
          >
            <Text
              style={[
                styles.segmentLabel,
                isComplete && styles.segmentLabelComplete,
              ]}
            >
              {getDayOfWeekLetter(d.dayYYYYMMDD)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Colors.surfaceContainer,
    borderRadius: 999,
    padding: 3,
    gap: 2,
    width: "100%",
    ...Platform.select({
      web: { userSelect: "none" } as any,
      default: {},
    }),
  },
  segment: {
    flex: 1,
    minHeight: 32,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
  },
  segmentToday: {
    borderColor: Colors.primary,
  },
  segmentLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  segmentLabelComplete: {
    color: Colors.onPrimary,
  },
});
