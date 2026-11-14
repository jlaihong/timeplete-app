import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { FontSize } from "../../theme/tokens";

type TabKey = "home" | "lists" | "calendar" | "trackables" | "insights";

const TABS: {
  key: TabKey;
  label: string;
  href: Href;
  icon: keyof typeof Ionicons.glyphMap;
  activeIcon: keyof typeof Ionicons.glyphMap;
}[] = [
  {
    key: "home",
    label: "Home",
    href: "/(app)/(tabs)",
    icon: "home-outline",
    activeIcon: "home",
  },
  {
    key: "lists",
    label: "Lists",
    href: "/(app)/lists",
    icon: "list-outline",
    activeIcon: "list",
  },
  {
    key: "calendar",
    label: "Calendar",
    href: "/(app)/(tabs)/calendar",
    icon: "calendar-outline",
    activeIcon: "calendar",
  },
  {
    key: "trackables",
    label: "Trackables",
    href: "/(app)/(tabs)/goals",
    icon: "trophy-outline",
    activeIcon: "trophy",
  },
  {
    key: "insights",
    label: "Insights",
    href: "/(app)/(tabs)/analytics",
    icon: "bar-chart-outline",
    activeIcon: "bar-chart",
  },
];

/** Which tab owns the current path; null on Settings and its sub-pages. */
export function mobileTabForPath(pathname: string): TabKey | null {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/") return "home";
  if (path === "/lists" || path.startsWith("/lists/") || path === "/inbox") {
    return "lists";
  }
  if (path === "/calendar") return "calendar";
  if (path === "/goals" || path.startsWith("/edit-trackable/")) {
    return "trackables";
  }
  if (path === "/analytics" || path === "/reviews") return "insights";
  return null;
}

export const MOBILE_TAB_BAR_HEIGHT = 56;

/**
 * The phone's bottom navigation. It is drawn by the app layout, below every
 * navigator, so it stays on screen on all pages — not only the ones inside
 * the `(tabs)` group. It replaces the drawer on phones.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const active = mobileTabForPath(pathname);

  return (
    <View
      style={[styles.bar, { paddingBottom: insets.bottom }]}
      accessibilityRole="tablist"
    >
      {TABS.map((tab) => {
        const focused = tab.key === active;
        return (
          <Pressable
            key={tab.key}
            onPress={() => {
              // `replace` between navigators becomes a JUMP_TO on the
              // drawer, so switching tabs never stacks history; inside the
              // lists stack it also pops an open list back to the index.
              router.replace(tab.href);
            }}
            accessibilityRole="tab"
            accessibilityLabel={tab.label}
            accessibilityState={{ selected: focused }}
            style={styles.tab}
          >
            <Ionicons
              name={focused ? tab.activeIcon : tab.icon}
              size={22}
              color={focused ? Colors.tab.active : Colors.tab.inactive}
            />
            <Text
              style={[styles.label, focused && styles.labelActive]}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceContainer,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
  },
  tab: {
    flex: 1,
    height: MOBILE_TAB_BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  label: {
    fontSize: FontSize.micro + 1,
    lineHeight: 14,
    color: Colors.tab.inactive,
  },
  labelActive: { color: Colors.tab.active, fontWeight: "600" },
});
