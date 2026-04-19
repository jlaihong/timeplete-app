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

/**
 * Faithful port of productivity-one's `app-card-button`:
 * a `mat-card` row containing a 64px material icon on the left and
 * a name/caption stack on the right. Hover/press elevation uses the
 * surface tonal variants from the Material 3 palette.
 */
export function CardOptionButton({ option }: { option: CardOption }) {
  const [isHovering, setIsHovering] = React.useState(false);
  const [isPressed, setIsPressed] = React.useState(false);

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
        isHovering && styles.cardHover,
        isPressed && styles.cardPressed,
      ]}
    >
      <View style={styles.row}>
        <MaterialIcons
          name={option.icon}
          size={64}
          color={Colors.text}
          style={styles.icon}
        />
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>
            {option.name}
          </Text>
          <Text style={styles.caption} numberOfLines={2}>
            {option.caption}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 0,
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
    alignItems: "center",
    gap: 12,
  },
  icon: { width: 64, height: 64, lineHeight: 64 },
  copy: { flex: 1, minWidth: 0 },
  name: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.text,
    marginBottom: 2,
  },
  caption: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
