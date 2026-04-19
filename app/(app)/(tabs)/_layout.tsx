import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../constants/colors";
import { TouchableOpacity, Platform } from "react-native";
import { DrawerActions, useNavigation } from "@react-navigation/native";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

export default function TabsLayout() {
  const isDesktop = useIsDesktop();
  const navigation = useNavigation();

  const headerLeft = () => (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={{ paddingLeft: 16 }}
    >
      <Ionicons name="menu" size={24} color={Colors.text} />
    </TouchableOpacity>
  );

  return (
    <Tabs
      screenOptions={{
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
        headerStyle: { backgroundColor: Colors.surfaceContainer },
        headerTintColor: Colors.text,
        ...(isDesktop ? {} : { headerLeft }),
      }}
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
