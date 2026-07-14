import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, stackHeaderChromeOptions } from "../../../constants/colors";
import { Platform } from "react-native";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";

export default function TabsLayout() {
  const isDesktop = useIsDesktop();

  const headerLeft = () => <DrawerMenuButton />;

  return (
    <Tabs
      screenOptions={() => ({
        tabBarActiveTintColor: Colors.tab.active,
        tabBarInactiveTintColor: Colors.tab.inactive,
        tabBarStyle: isDesktop
          ? { display: "none" }
          : {
              backgroundColor: Colors.surfaceContainer,
              borderTopColor: Colors.outlineVariant,
              height: Platform.OS === "ios" ? 88 : 64,
              paddingBottom: Platform.OS === "ios" ? 28 : 8,
              paddingTop: 8,
            },
        headerShown: !isDesktop,
        ...stackHeaderChromeOptions,
        // `DrawerMenuButton` is symmetric on iOS (so it centers inside the
        // native-header capsule on Stack screens); this JS tab header draws
        // no capsule, so restore the left inset at the container level.
        headerLeftContainerStyle:
          Platform.OS === "ios" ? { paddingLeft: 8 } : undefined,
        headerLeft,
      })}
    >
      <Tabs.Screen
        name="goals"
        options={{
          title: "Trackables",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trophy-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="calendar-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Analytics",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reviews"
        options={{
          // Hidden from the tab bar (reached via the drawer), but still
          // needs a title — the header falls back to the lowercase route
          // name ("reviews") without one.
          title: "Reviews",
          href: null,
        }}
      />
    </Tabs>
  );
}
