import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, stackHeaderChromeOptions } from "../../../constants/colors";
import { Platform } from "react-native";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { HeaderAccountButton } from "../../../components/layout/HeaderAccountButton";

export default function TabsLayout() {
  const isDesktop = useIsDesktop();

  const headerRight = () => <HeaderAccountButton />;

  return (
    <Tabs
      // The phone's tab bar is drawn by the app layout (`MobileTabBar`) so
      // it also shows on screens outside this group; desktop has a sidebar.
      tabBar={() => null}
      screenOptions={() => ({
        tabBarActiveTintColor: Colors.tab.active,
        tabBarInactiveTintColor: Colors.tab.inactive,
        headerShown: !isDesktop,
        ...stackHeaderChromeOptions,
        headerRight,
      })}
    >
      <Tabs.Screen
        name="index"
        options={{
          // Same name as the drawer row and the desktop sidebar.
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home-outline" size={size} color={color} />
          ),
        }}
      />
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
          // Shares the Insights tab with Analytics (see `InsightsSwitch`).
          title: "Reviews",
          href: null,
        }}
      />
    </Tabs>
  );
}
