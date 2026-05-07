import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import {
  formatDisplayDate,
  isoDateToYyyymmdd,
  parseYYYYMMDD,
  yyyymmddToIsoDate,
} from "../../lib/dates";
import { useAnalyticsState } from "./AnalyticsState";

/**
 * Date navigator — productivity-one's `analytics-date-navigator`.
 * - Daily/Weekly/Monthly on web: centered label above a row of
 *   `< [date input] >` so chevrons align with the picker, not the label.
 * - Yearly / native: `< label >` between chevrons (no separate picker).
 */
export function AnalyticsDateNavigator() {
  const {
    selectedTab,
    selectedDate,
    windowStart,
    windowEnd,
    setSelectedDate,
    goPrev,
    goNext,
    goToday,
  } = useAnalyticsState();

  const isYearly = selectedTab === "YEARLY";

  const middleLabel = (() => {
    switch (selectedTab) {
      case "DAILY":
        return formatDisplayDate(selectedDate);
      case "WEEKLY":
        return `${formatDisplayDate(windowStart)} – ${formatDisplayDate(windowEnd)}`;
      case "MONTHLY":
        return parseYYYYMMDD(selectedDate).toLocaleDateString(undefined, {
          month: "long",
          year: "numeric",
        });
      case "YEARLY":
        return selectedDate.slice(0, 4);
    }
  })();

  const hasWebPicker = !isYearly && Platform.OS === "web";

  const prevBtn = <NavChevron direction="back" onPress={goPrev} />;
  const nextBtn = <NavChevron direction="forward" onPress={goNext} />;

  if (hasWebPicker) {
    return (
      <View style={styles.outer}>
        <TouchableOpacity onPress={goToday} style={styles.labelTap}>
          <Text style={styles.middleLabel}>{middleLabel}</Text>
        </TouchableOpacity>
        <View style={styles.pickerRow}>
          {prevBtn}
          <DateInputWeb value={selectedDate} onChange={setSelectedDate} />
          {nextBtn}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.row}>
      {prevBtn}
      <TouchableOpacity onPress={goToday} style={styles.labelTapInline}>
        <Text style={styles.middleLabel}>{middleLabel}</Text>
      </TouchableOpacity>
      {nextBtn}
    </View>
  );
}

function NavChevron({
  direction,
  onPress,
}: {
  direction: "back" | "forward";
  onPress: () => void;
}) {
  const [hovered, setHovered] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const showCue = hovered || pressed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={direction === "back" ? "Previous" : "Next"}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[styles.iconBtn, showCue && styles.iconBtnActive]}
    >
      <Ionicons
        name={direction === "back" ? "chevron-back" : "chevron-forward"}
        size={22}
        color={Colors.primary}
      />
    </Pressable>
  );
}

function DateInputWeb({
  value,
  onChange,
}: {
  value: string;
  onChange: (yyyymmdd: string) => void;
}) {
  return (
    <input
      type="date"
      value={yyyymmddToIsoDate(value)}
      onChange={(e) => {
        const v = (e.target as HTMLInputElement).value;
        if (v) onChange(isoDateToYyyymmdd(v));
      }}
      style={{
        backgroundColor: Colors.surfaceContainer,
        color: Colors.text,
        border: `1px solid ${Colors.outlineVariant}`,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 13,
        fontFamily: "inherit",
      }}
    />
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
    maxWidth: "100%",
    alignSelf: "center",
  },
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
    maxWidth: "100%",
    alignSelf: "center",
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition:
          "background-color 160ms ease, box-shadow 160ms ease, transform 160ms ease",
      } as Record<string, unknown>,
      default: {},
    }),
  },
  iconBtnActive: {
    backgroundColor: Colors.surfaceContainerHigh,
    ...Platform.select({
      web: {
        boxShadow: "0 0 0 2px rgba(0, 218, 245, 0.35)",
        transform: [{ scale: 1.05 }],
      } as Record<string, unknown>,
      default: {},
    }),
  },
  labelTap: {
    alignSelf: "stretch",
  },
  labelTapInline: {
    maxWidth: "100%",
    flexShrink: 1,
  },
  middleLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
});
