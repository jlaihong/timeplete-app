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
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { router, Redirect, type Href } from "expo-router";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useDrawerSelection } from "../../hooks/useDrawerSelection";
import { TimerDisplay } from "../../components/timer/TimerDisplay";

const drawerItemStyle = { borderRadius: 8 };

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  const { isAuthenticated } = useAuth();
  const isDesktop = useIsDesktop();
  const sel = useDrawerSelection();
  const lists = useQuery(api.lists.search, isAuthenticated ? {} : "skip");

  const go = (href: Href) => {
    router.push(href);
    if (!isDesktop) {
      navigation.closeDrawer();
    }
  };

  return (
    <DrawerContentScrollView {...props} style={styles.drawer}>
      {!isDesktop && (
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Timeplete</Text>
        </View>
      )}

      <DrawerItem
        label="Home"
        focused={sel.home}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="home-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)")}
      />
      <DrawerItem
        label="Trackables"
        focused={sel.goals}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="analytics-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)/goals")}
      />
      <DrawerItem
        label="Calendar"
        focused={sel.calendar}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="calendar-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)/calendar")}
      />
      <DrawerItem
        label="Analytics"
        focused={sel.analytics}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="bar-chart-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)/analytics")}
      />

      {!isDesktop && (
        <DrawerItem
          label="Reviews"
          focused={sel.reviews}
          activeBackgroundColor={Colors.sidenavItemActive}
          inactiveTintColor={Colors.textSecondary}
          activeTintColor={Colors.white}
          style={drawerItemStyle}
          icon={({ size, color }) => (
            <Ionicons name="journal-outline" size={size} color={color} />
          )}
          onPress={() => go("/(app)/(tabs)/reviews")}
        />
      )}

      <DrawerItem
        label="Tags"
        focused={sel.tags}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="pricetag-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/tags")}
      />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>My Lists</Text>
      {lists &&
        lists
          .filter((l: { archived?: boolean }) => !l.archived)
          .map((list: { _id: string; name: string; colour: string }) => (
            <DrawerItem
              key={list._id}
              label={list.name}
              focused={sel.activeListId === list._id}
              activeBackgroundColor={Colors.sidenavItemActive}
              inactiveTintColor={Colors.textSecondary}
              activeTintColor={Colors.white}
              style={drawerItemStyle}
              icon={() => (
                <View
                  style={[styles.listDot, { backgroundColor: list.colour }]}
                />
              )}
              onPress={() => go(`/(app)/lists/${list._id}`)}
            />
          ))}
      <DrawerItem
        label="All Lists"
        focused={sel.allLists}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="list-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/lists")}
      />

      <View style={styles.divider} />

      <DrawerItem
        label="Shared with Me"
        focused={sel.shared}
        activeBackgroundColor={Colors.sidenavItemActive}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.white}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="people-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/shared")}
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
          navigation.closeDrawer();
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
        drawerContent={(p) => <CustomDrawerContent {...p} />}
        defaultStatus={isDesktop ? "open" : "closed"}
        screenOptions={{
          headerShown: false,
          drawerType: isDesktop ? "permanent" : "slide",
          swipeEnabled: !isDesktop,
          overlayColor: "transparent",
          drawerStyle: {
            backgroundColor: Colors.sidenav,
            width: 250,
            borderRightWidth: 0,
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
    color: Colors.text,
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
