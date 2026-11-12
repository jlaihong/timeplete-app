import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { FontSize } from "../../theme/tokens";
import { useIsDesktop } from "../../hooks/useIsDesktop";

/**
 * Width of the centred column used by pages whose content is naturally
 * narrow (Lists, Tags, Reviews, Settings), the same reading width as a
 * list's own page: 672px of content plus 16px of padding either side.
 * Pages that need the room (Home, Analytics, Trackables) don't use it.
 */
export const PAGE_COLUMN_WIDTH = 704;

/** Centres a block in the page column. Harmless on a phone, which is narrower. */
export const pageColumnStyle = {
  width: "100%",
  maxWidth: PAGE_COLUMN_WIDTH,
  alignSelf: "center",
} as const;

/**
 * Page title for desktop web, where the navigator's own header is hidden.
 * Same height and type size as the Home column headers so every page's
 * title sits in the same place. Renders nothing on phones, which keep the
 * native header.
 */
export function DesktopPageHeader({
  title,
  right,
  onBack,
  backLabel = "Back",
  column = false,
}: {
  /** Line the title up with a centred page column (see `pageColumnStyle`). */
  column?: boolean;
  title: string;
  right?: React.ReactNode;
  /** For a page reached from another page rather than from the sidebar. */
  onBack?: () => void;
  backLabel?: string;
}) {
  const isDesktop = useIsDesktop();
  if (!isDesktop) return null;
  return (
    <View style={[styles.bar, column && pageColumnStyle]}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={backLabel}
          hitSlop={8}
          style={styles.back}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.textSecondary} />
        </Pressable>
      ) : null}
      <Text style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
  },
  back: { marginLeft: -6, padding: 4 },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.title,
    fontWeight: "600",
    color: Colors.text,
  },
});
