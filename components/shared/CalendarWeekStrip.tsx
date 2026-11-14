import React, { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import {
  addDays,
  getDayOfWeekLetter,
  parseYYYYMMDD,
  startOfWeek,
} from "../../lib/dates";

/**
 * Phone calendar: the week containing the selected day, Monday first.
 * One tap jumps to any day of the week, instead of stepping a day at a
 * time with the arrows; the arrows beside it still move the selection, and
 * the strip follows into the next week.
 */
export function CalendarWeekStrip({
  selectedDay,
  today,
  onSelectDay,
}: {
  selectedDay: string;
  today: string;
  onSelectDay: (day: string) => void;
}) {
  const days = useMemo(() => {
    const monday = startOfWeek(selectedDay);
    return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  }, [selectedDay]);

  return (
    <View style={styles.strip} accessibilityRole="tablist">
      {days.map((day) => {
        const selected = day === selectedDay;
        const isToday = day === today;
        const date = parseYYYYMMDD(day);
        return (
          <Pressable
            key={day}
            onPress={() => onSelectDay(day)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={date.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
            style={styles.day}
          >
            <Text style={[styles.letter, isToday && styles.letterToday]}>
              {getDayOfWeekLetter(day)}
            </Text>
            <View
              style={[
                styles.number,
                isToday && styles.numberToday,
                selected && styles.numberSelected,
              ]}
            >
              <Text
                style={[
                  styles.numberText,
                  isToday && styles.numberTextToday,
                  selected && styles.numberTextSelected,
                ]}
              >
                {date.getDate()}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: "row",
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  day: { flex: 1, alignItems: "center", gap: 4, paddingVertical: 2 },
  letter: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  letterToday: { color: Colors.primary },
  number: {
    width: 36,
    height: 36,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  numberToday: { borderWidth: 1, borderColor: Colors.primary },
  numberSelected: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  numberText: { fontSize: FontSize.body, color: Colors.text },
  numberTextToday: { color: Colors.primary, fontWeight: "600" },
  numberTextSelected: { color: Colors.onPrimary, fontWeight: "700" },
});
