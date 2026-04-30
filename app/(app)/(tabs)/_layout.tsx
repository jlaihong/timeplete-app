import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors, stackHeaderChromeOptions } from "../../../constants/colors";
import { Platform } from "react-native";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { DrawerMenuButton } from "../../../components/layout/DrawerMenuButton";
import { DesktopBrandedHeaderTitle } from "../../../components/layout/DesktopBrandedHeaderTitle";

export default function TabsLayout() {
  const isDesktop = useIsDesktop();

  const headerLeft = () => <DrawerMenuButton />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
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
        headerShown: true,
        ...stackHeaderChromeOptions,
        headerLeft,
        ...(isDesktop
          ? {
              headerTitleAlign: "left",
              headerTitle: () => <DesktopBrandedHeaderTitle />,
            }
          : {}),
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
          href: null,
        }}
      />
    </Tabs>
  );
}
