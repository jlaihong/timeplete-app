import React from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import {
  DrawerContentScrollView,
  DrawerItem,
} from "@react-navigation/drawer";
import { router, Redirect } from "expo-router";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { TimerDisplay } from "../../components/timer/TimerDisplay";

const drawerLabelStyle = { color: Colors.text };
const drawerItemStyle = { borderRadius: 8 };

function CustomDrawerContent(props: any) {
  const { isAuthenticated } = useAuth();
  const isDesktop = useIsDesktop();
  const lists = useQuery(api.lists.search, isAuthenticated ? {} : "skip");

  return (
    <DrawerContentScrollView {...props} style={styles.drawer}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Timeplete</Text>
      </View>

      <DrawerItem
        label="Home"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons name="home-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)")}
      />
      <DrawerItem
        label="Trackables"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="analytics-outline"
            size={size}
            color={Colors.primary}
          />
        )}
        onPress={() => router.push("/(app)/(tabs)/goals")}
      />
      <DrawerItem
        label="Calendar"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="calendar-outline"
            size={size}
            color={Colors.primary}
          />
        )}
        onPress={() => router.push("/(app)/(tabs)/calendar")}
      />
      <DrawerItem
        label="Analytics"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="bar-chart-outline"
            size={size}
            color={Colors.primary}
          />
        )}
        onPress={() => router.push("/(app)/(tabs)/analytics")}
      />

      {!isDesktop && (
        <DrawerItem
          label="Reviews"
          labelStyle={drawerLabelStyle}
          style={drawerItemStyle}
          icon={({ size }) => (
            <Ionicons
              name="journal-outline"
              size={size}
              color={Colors.primary}
            />
          )}
          onPress={() => router.push("/(app)/(tabs)/reviews")}
        />
      )}

      <DrawerItem
        label="Tags"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="pricetag-outline"
            size={size}
            color={Colors.primary}
          />
        )}
        onPress={() => router.push("/(app)/tags")}
      />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>My Lists</Text>
      {lists &&
        lists
          .filter((l: any) => !l.archived)
          .map((list: any) => (
            <DrawerItem
              key={list._id}
              label={list.name}
              labelStyle={drawerLabelStyle}
              style={drawerItemStyle}
              icon={() => (
                <View
                  style={[styles.listDot, { backgroundColor: list.colour }]}
                />
              )}
              onPress={() => router.push(`/(app)/lists/${list._id}`)}
            />
          ))}
      <DrawerItem
        label="All Lists"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="list-outline"
            size={size}
            color={Colors.textSecondary}
          />
        )}
        onPress={() => router.push("/(app)/lists")}
      />

      <View style={styles.divider} />

      <DrawerItem
        label="Shared with Me"
        labelStyle={drawerLabelStyle}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="people-outline"
            size={size}
            color={Colors.textSecondary}
          />
        )}
        onPress={() => router.push("/(app)/shared")}
      />

      <View style={styles.divider} />

      <DrawerItem
        label="Sign Out"
        labelStyle={{ color: Colors.error }}
        style={drawerItemStyle}
        icon={({ size }) => (
          <Ionicons
            name="log-out-outline"
            size={size}
            color={Colors.error}
          />
        )}
        onPress={async () => {
          await authClient.signOut();
          router.replace("/");
        }}
      />
    </DrawerContentScrollView>
  );
}

export default function AppLayout() {
  const isDesktop = useIsDesktop();
  const { isAuthenticated, isLoading, isApproved } = useAuth();

  // Auth guard: without this, screens inside (app) render and immediately
  // call queries that require an authenticated identity, producing
  // "Not authenticated" errors when a user hits a deep link or lingers
  // on a stale page after sign-out. The root index.tsx redirect doesn't
  // protect against direct navigation to e.g. /(app)/(tabs).
  if (isLoading) {
    return (
      <View style={styles.authGuardCenter}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }
  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }
  if (!isApproved) {
    return <Redirect href="/(auth)/pending-approval" />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <TimerDisplay />
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{
          headerShown: false,
          drawerType: isDesktop ? "permanent" : "front",
          swipeEnabled: !isDesktop,
          overlayColor: isDesktop ? "transparent" : "rgba(0,0,0,0.5)",
          drawerStyle: {
            backgroundColor: Colors.sidenav,
            width: 250,
            borderRightWidth: isDesktop ? 1 : 0,
            borderRightColor: Colors.outlineVariant,
          },
        }}
      >
        <Drawer.Screen name="(tabs)" />
        <Drawer.Screen name="tags" options={{ title: "Tags" }} />
        <Drawer.Screen name="lists" options={{ title: "Lists" }} />
        <Drawer.Screen name="shared" options={{ title: "Shared" }} />
        <Drawer.Screen
          name="edit-trackable"
          options={{ title: "Edit Goal" }}
        />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: Colors.sidenav },
  drawerHeader: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineVariant,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.outlineVariant,
    marginVertical: 8,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textTertiary,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  listDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  authGuardCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
