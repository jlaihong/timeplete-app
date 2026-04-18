import React from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { View, Text, StyleSheet } from "react-native";
import { DrawerContentScrollView, DrawerItem } from "@react-navigation/drawer";
import { router } from "expo-router";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../hooks/useAuth";

function CustomDrawerContent(props: any) {
  const { isAuthenticated } = useAuth();
  const lists = useQuery(api.lists.search, isAuthenticated ? {} : "skip");

  return (
    <DrawerContentScrollView {...props} style={styles.drawer}>
      <View style={styles.drawerHeader}>
        <Text style={styles.drawerTitle}>Timeplete</Text>
      </View>

      <DrawerItem
        label="Tasks"
        icon={({ size }) => (
          <Ionicons name="checkbox-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)")}
      />
      <DrawerItem
        label="Calendar"
        icon={({ size }) => (
          <Ionicons name="calendar-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)/calendar")}
      />
      <DrawerItem
        label="Goals"
        icon={({ size }) => (
          <Ionicons name="trophy-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)/goals")}
      />
      <DrawerItem
        label="Analytics"
        icon={({ size }) => (
          <Ionicons name="bar-chart-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)/analytics")}
      />
      <DrawerItem
        label="Reviews"
        icon={({ size }) => (
          <Ionicons name="journal-outline" size={size} color={Colors.primary} />
        )}
        onPress={() => router.push("/(app)/(tabs)/reviews")}
      />

      <View style={styles.divider} />

      <DrawerItem
        label="Tags"
        icon={({ size }) => (
          <Ionicons name="pricetag-outline" size={size} color={Colors.textSecondary} />
        )}
        onPress={() => router.push("/(app)/tags")}
      />
      <DrawerItem
        label="All Lists"
        icon={({ size }) => (
          <Ionicons name="list-outline" size={size} color={Colors.textSecondary} />
        )}
        onPress={() => router.push("/(app)/lists")}
      />
      <DrawerItem
        label="Shared with Me"
        icon={({ size }) => (
          <Ionicons name="people-outline" size={size} color={Colors.textSecondary} />
        )}
        onPress={() => router.push("/(app)/shared")}
      />

      {lists && lists.filter((l) => l.showInSidebar && !l.archived).length > 0 && (
        <>
          <View style={styles.divider} />
          <Text style={styles.sectionTitle}>Lists</Text>
          {lists
            .filter((l) => l.showInSidebar && !l.archived)
            .map((list) => (
              <DrawerItem
                key={list._id}
                label={list.name}
                icon={() => (
                  <View
                    style={[styles.listDot, { backgroundColor: list.colour }]}
                  />
                )}
                onPress={() => router.push(`/(app)/lists/${list._id}`)}
              />
            ))}
        </>
      )}
      <View style={styles.divider} />
      <DrawerItem
        label="Sign Out"
        icon={({ size }) => (
          <Ionicons name="log-out-outline" size={size} color={Colors.error} />
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
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Drawer.Screen name="(tabs)" />
        <Drawer.Screen name="tags" options={{ title: "Tags" }} />
        <Drawer.Screen name="lists" options={{ title: "Lists" }} />
        <Drawer.Screen name="shared" options={{ title: "Shared" }} />
        <Drawer.Screen name="edit-trackable" options={{ title: "Edit Goal" }} />
      </Drawer>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  drawer: { flex: 1, backgroundColor: Colors.surface },
  drawerHeader: {
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  drawerTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: Colors.primary,
    letterSpacing: -0.5,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.borderLight,
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
});
