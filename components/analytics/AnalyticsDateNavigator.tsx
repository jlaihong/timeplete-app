import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
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
 * - Daily/Weekly/Monthly: centered label above native `<input type="date">`
 *   on web; chevrons step the right amount.
 * - Yearly: hides the picker entirely (P1 has no datepicker on yearly),
 *   shows just `< YYYY >` arrows.
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

  return (
    <View style={styles.row}>
      <TouchableOpacity
        onPress={goPrev}
        style={styles.iconBtn}
        accessibilityLabel="Previous"
      >
        <Ionicons
          name="chevron-back"
          size={22}
          color={Colors.primary}
        />
      </TouchableOpacity>

      <View style={styles.center}>
        <TouchableOpacity onPress={goToday} style={styles.labelTap}>
          <Text style={styles.middleLabel}>{middleLabel}</Text>
        </TouchableOpacity>
        {!isYearly && Platform.OS === "web" && (
          <DateInputWeb
            value={selectedDate}
            onChange={setSelectedDate}
          />
        )}
      </View>

      <TouchableOpacity
        onPress={goNext}
        style={styles.iconBtn}
        accessibilityLabel="Next"
      >
        <Ionicons
          name="chevron-forward"
          size={22}
          color={Colors.primary}
        />
      </TouchableOpacity>
    </View>
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  labelTap: {
    alignSelf: "stretch",
  },
  center: {
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    maxWidth: "100%",
  },
  middleLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
});
