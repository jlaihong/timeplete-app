import { FontSize, Radius } from "../../theme/tokens";
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
import { todayYYYYMMDD } from "../../lib/dates";
import {
  currentPeriodName,
  reviewPeriodLabel,
  reviewPeriodStart,
} from "../../lib/reviewPeriod";
import { useAnalyticsState } from "./AnalyticsState";

/**
 * Date navigator — productivity-one's `analytics-date-navigator`.
 * - Daily/Weekly/Monthly on web: centered label above a row of
 *   `< [date input] >` so chevrons align with the picker, not the label.
 * - Yearly / native: `< label >` between chevrons (no separate picker).
 */
export function AnalyticsDateNavigator({
  inline = false,
}: {
  /** One compact row (desktop toolbar) instead of label above picker. */
  inline?: boolean;
}) {
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

  if (inline) {
    // Same shape as the Reviews header: ‹ period ›, a link back to the
    // current period once you step away, then the date picker.
    const isCurrent =
      reviewPeriodStart(selectedTab, selectedDate) ===
      reviewPeriodStart(selectedTab, todayYYYYMMDD());
    return (
      <View style={styles.inlineRow}>
        {prevBtn}
        <Text style={[styles.middleLabel, styles.inlineLabel]}>
          {reviewPeriodLabel(
            selectedTab,
            reviewPeriodStart(selectedTab, selectedDate),
          )}
        </Text>
        {nextBtn}
        {!isCurrent ? (
          <TouchableOpacity
            onPress={goToday}
            accessibilityRole="button"
            style={styles.currentLink}
          >
            <Text style={styles.currentLinkText}>
              {currentPeriodName(selectedTab)}
            </Text>
          </TouchableOpacity>
        ) : null}
        {hasWebPicker ? (
          <DateInputWeb value={selectedDate} onChange={setSelectedDate} />
        ) : null}
      </View>
    );
  }

  if (hasWebPicker) {
    // Phone-width web: one row. The label is the date; an invisible date
    // input lies over it, so tapping the label opens the browser's picker
    // (the old layout stacked the label above a raw "2026-11-14" field).
    return (
      <View style={styles.row}>
        {prevBtn}
        <View style={styles.labelPicker}>
          <Text style={styles.middleLabel}>{middleLabel}</Text>
          <DateInputWeb
            value={selectedDate}
            onChange={setSelectedDate}
            overlay
          />
        </View>
        {nextBtn}
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
        size={20}
        color={Colors.textSecondary}
      />
    </Pressable>
  );
}

function DateInputWeb({
  value,
  onChange,
  overlay = false,
}: {
  value: string;
  onChange: (yyyymmdd: string) => void;
  /** Invisible, stretched over its parent: the parent's text is the label. */
  overlay?: boolean;
}) {
  if (overlay) {
    return (
      <input
        type="date"
        aria-label="Pick a date"
        value={yyyymmddToIsoDate(value)}
        onChange={(e) => {
          const v = (e.target as HTMLInputElement).value;
          if (v) onChange(isoDateToYyyymmdd(v));
        }}
        onClick={(e) => {
          try {
            (e.target as HTMLInputElement).showPicker?.();
          } catch {
            /* unsupported: the input's own behaviour applies */
          }
        }}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          opacity: 0,
          cursor: "pointer",
          colorScheme: "dark",
        }}
      />
    );
  }
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
        borderRadius: Radius.md,
        padding: "6px 10px",
        fontSize: FontSize.body,
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
  inlineRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  inlineLabel: { minWidth: 96, textAlign: "center" },
  currentLink: { marginHorizontal: 6 },
  currentLinkText: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.primary,
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
    borderRadius: Radius.pill,
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
  labelPicker: {
    position: "relative",
    minHeight: 36,
    minWidth: 150,
    paddingHorizontal: 12,
    justifyContent: "center",
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainer,
  },
  labelTap: {
    alignSelf: "stretch",
  },
  labelTapInline: {
    maxWidth: "100%",
    flexShrink: 1,
  },
  middleLabel: {
    fontSize: FontSize.body,
    fontWeight: "600",
    color: Colors.text,
    textAlign: "center",
  },
});
