import React from "react";
import { Pressable, View, Text, StyleSheet, Platform } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

export interface CardOption {
  name: string;
  caption: string;
  icon: React.ComponentProps<typeof MaterialIcons>["name"];
  onPress: () => void;
}

interface CardOptionButtonProps {
  option: CardOption;
  twoColumn?: boolean;
}

/**
 * Faithful port of productivity-one's `app-card-button`:
 * a `mat-card` row containing a 64px material icon on the left and
 * a name/caption stack on the right. Hover/press elevation uses the
 * surface tonal variants from the Material 3 palette.
 */
export function CardOptionButton({
  option,
  twoColumn = false,
}: CardOptionButtonProps) {
  const [isHovering, setIsHovering] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

  // Desktop keeps productivity-one's oversized 64px icon. On mobile the
  // card is much narrower, so a 64px icon squeezes the text column and
  // forces titles/captions into awkward wraps — use a compact icon.
  const iconSize = twoColumn ? 64 : 40;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={option.onPress}
      onHoverIn={() => setIsHovering(true)}
      onHoverOut={() => setIsHovering(false)}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      style={[
        styles.card,
        twoColumn && styles.cardTwoColumn,
        isHovering && styles.cardHover,
        isPressed && styles.cardPressed,
      ]}
    >
      <View style={[styles.row, !twoColumn && styles.rowCompact]}>
        <MaterialIcons
          name={option.icon}
          size={iconSize}
          color={Colors.text}
          style={{ width: iconSize, height: iconSize, lineHeight: iconSize }}
        />
        <View style={styles.copy}>
          {/* `simple` break strategy = greedy wrapping. Android defaults to
           * `highQuality`, which balances line lengths and breaks lines
           * early ("Create a goal / with targets…" instead of filling the
           * first line), reading like accidental formatting. */}
          <Text
            style={[styles.name, !twoColumn && styles.nameCompact]}
            textBreakStrategy="simple"
          >
            {option.name}
          </Text>
          <Text style={styles.caption} textBreakStrategy="simple">
            {option.caption}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    padding: 16,
    borderRadius: 12,
    backgroundColor: Colors.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    ...Platform.select({
      web: {
        cursor: "pointer",
        userSelect: "none",
        transition: "background-color 120ms ease, transform 120ms ease",
      } as any,
      default: {},
    }),
  },
  cardTwoColumn: {
    // Two-column layout for desktop onboarding dialogs.
    // `flex: 1` style sharing makes paired cards split row space
    // evenly. `minWidth` forces a wrap to a new row only when there
    // genuinely isn't enough horizontal space for two cards side by
    // side. Avoids the percentage+gap math that caused unintentional
    // single-column collapse and uneven row widths.
    flexBasis: 0,
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 240,
    width: "auto",
  },
  cardHover: {
    backgroundColor: Colors.surfaceContainerHighest,
  },
  cardPressed: {
    backgroundColor: Colors.surfaceContainerHighest,
    ...Platform.select({
      web: { transform: [{ scale: 0.99 }] } as any,
      default: {},
    }),
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  rowCompact: {
    alignItems: "center",
    gap: 16,
  },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  // Mobile: slightly smaller title so common option names fit on one line
  // in the narrower single-column card.
  nameCompact: {
    fontSize: 17,
    marginBottom: 3,
  },
  caption: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
