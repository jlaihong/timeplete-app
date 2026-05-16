import React, { useCallback, useEffect, useMemo } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import {
  DrawerContentScrollView,
  DrawerItem,
  type DrawerContentComponentProps,
} from "@react-navigation/drawer";
import { router, Redirect, useRouter, useSegments, useNavigationContainerRef, type Href } from "expo-router";
import { authClient } from "../../lib/auth-client";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useDrawerSelection } from "../../hooks/useDrawerSelection";
import { TimerDisplay } from "../../components/timer/TimerDisplay";
import {
  DesktopAppChromeProvider,
  DesktopAppTopBar,
  useRegisterDrawerNavigationForDesktopChrome,
} from "../../components/layout/DesktopAppChrome";
import { NavPathTrace } from "../../components/debug/NavPathTrace";
import { NavTreeProfiler } from "../../components/debug/NavTreeProfiler";
import { flushExpoRouterNavigationQueue } from "../../lib/flushExpoRouterNavigationQueue";
import {
  logRouterInvoked,
  traceRouterDispatched,
  traceSidebarClick,
  traceSidebarClickFlushComplete,
} from "../../lib/navInstrumentation";

const drawerItemStyle = { borderRadius: 8 };

/**
 * Expo Router maps imperative calls to React Navigation actions in `getNavigateAction`:
 * - `router.push` on a non-stack navigator becomes `NAVIGATE`, which skips the `expo-tab`
 *   branch and therefore does **not** become `JUMP_TO` for tab changes.
 * - `router.navigate` on tabs becomes `JUMP_TO` — instant tab switches (matches SPA routers
 *   that update the active outlet immediately).
 * - `router.replace` on the drawer becomes `JUMP_TO` — avoids stacking duplicate drawer
 *   branches when moving between tabs, lists, tags, etc.
 */
type NavDrawerGroup = "tabs" | "lists" | "tags" | "shared";

function navDrawerGroupFromSegments(
  segments: readonly string[],
): NavDrawerGroup | null {
  const top = segments[1];
  if (top === "(tabs)") return "tabs";
  if (top === "lists") return "lists";
  if (top === "tags") return "tags";
  if (top === "shared") return "shared";
  return null;
}

function navDrawerGroupFromHrefString(href: string): NavDrawerGroup | null {
  if (href.includes("/(tabs)")) return "tabs";
  if (href.includes("/lists")) return "lists";
  if (href.includes("/tags")) return "tags";
  if (href.includes("/shared")) return "shared";
  return null;
}

const PREFETCH_DRAWER_HREFS: Href[] = [
  "/(app)/(tabs)",
  "/(app)/(tabs)/goals",
  "/(app)/(tabs)/analytics",
  "/(app)/(tabs)/calendar",
  "/(app)/(tabs)/reviews",
  "/(app)/tags",
  "/(app)/lists",
  "/(app)/shared",
];

function CustomDrawerContent(props: DrawerContentComponentProps) {
  const { navigation } = props;
  useRegisterDrawerNavigationForDesktopChrome(navigation);
  const navigationContainerRef = useNavigationContainerRef();
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const sel = useDrawerSelection();
  const expoRouter = useRouter();
  const segments = useSegments();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");

  useEffect(() => {
    if (!profileReady) return;
    for (const href of PREFETCH_DRAWER_HREFS) {
      router.prefetch(href);
    }
  }, [profileReady]);

  const inboxList = useMemo(() => {
    if (!lists) return null;
    const inbox = lists
      .filter((l) => l.isInbox && !l.archived)
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex);
    return inbox[0] ?? null;
  }, [lists]);

  const sidebarLists = useMemo(() => {
    if (!lists) return null;
    return lists.filter((l) => !l.archived && !l.isInbox);
  }, [lists]);

  const go = useCallback(
    (href: Href) => {
      const traceSeq = typeof href === "string" ? traceSidebarClick(href) : 0;
      const s = segments as readonly string[];
      const onListDetail =
        s[0] === "(app)" &&
        s[1] === "lists" &&
        typeof s[2] === "string";

      let useReplace = false;
      if (typeof href === "string") {
        const prefix = "/(app)/lists/";
        if (onListDetail && href.startsWith(prefix)) {
          const idPart = href.slice(prefix.length);
          if (idPart.length > 0 && !idPart.includes("/")) {
            useReplace = true;
          }
        }
      }

      let useReplaceCrossGroup = false;
      if (!useReplace && typeof href === "string") {
        const here = navDrawerGroupFromSegments(s);
        const there = navDrawerGroupFromHrefString(href);
        useReplaceCrossGroup =
          here != null && there != null && here !== there;
      }

      if (useReplace || useReplaceCrossGroup) {
        expoRouter.replace(href);
        if (typeof href === "string") {
          logRouterInvoked(traceSeq, "replace");
          traceRouterDispatched("replace", href);
        }
      } else {
        expoRouter.navigate(href);
        if (typeof href === "string") {
          logRouterInvoked(traceSeq, "navigate");
          traceRouterDispatched("navigate", href);
        }
      }

      flushExpoRouterNavigationQueue(navigationContainerRef);
      if (traceSeq !== 0) {
        traceSidebarClickFlushComplete(traceSeq);
      }

      if (!isDesktop) {
        navigation.closeDrawer();
      }
    },
    [expoRouter, isDesktop, navigation, navigationContainerRef, segments],
  );

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
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="home-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)")}
      />
      {inboxList ? (
        <DrawerItem
          label="Inbox"
          focused={sel.inbox}
          activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
          inactiveTintColor={Colors.textSecondary}
          activeTintColor={Colors.textSecondary}
          style={drawerItemStyle}
          icon={({ size, color }) => (
            <Ionicons name="file-tray-outline" size={size} color={color} />
          )}
          onPress={() => go(`/(app)/lists/${inboxList._id}`)}
        />
      ) : null}
      <DrawerItem
        label="Trackables"
        focused={sel.goals}
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="analytics-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/(tabs)/goals")}
      />
      <DrawerItem
        label="Analytics"
        focused={sel.analytics}
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
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
          activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
          inactiveTintColor={Colors.textSecondary}
          activeTintColor={Colors.textSecondary}
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
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
        style={drawerItemStyle}
        icon={({ size, color }) => (
          <Ionicons name="pricetag-outline" size={size} color={color} />
        )}
        onPress={() => go("/(app)/tags")}
      />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>My Lists</Text>
      {sidebarLists &&
        sidebarLists.map(
          (list: { _id: string; name: string; colour: string }) => (
            <DrawerItem
              key={list._id}
              label={list.name}
              focused={sel.activeListId === list._id}
              activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
              inactiveTintColor={Colors.textSecondary}
              activeTintColor={Colors.textSecondary}
              style={drawerItemStyle}
              icon={() => (
                <View
                  style={[styles.listDot, { backgroundColor: list.colour }]}
                />
              )}
              onPress={() => go(`/(app)/lists/${list._id}`)}
            />
          ),
        )}
      <DrawerItem
        label="All Lists"
        focused={sel.allLists}
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
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
        activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
        inactiveTintColor={Colors.textSecondary}
        activeTintColor={Colors.textSecondary}
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
          flushExpoRouterNavigationQueue(navigationContainerRef);
        }}
      />
    </DrawerContentScrollView>
  );
}

export default function AppLayout() {
  const isDesktop = useIsDesktop();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } =
    useConvexAuth();
  const { profile, isApproved } = useAuth();

  // Auth guard: without redirects below, screens inside (app) render after
  // sign-out. We intentionally NEVER swap this Drawer subtree for a
  // full-screen spinner while Convex/session bootstrap runs — replacing it
  // remounts the navigator and Expo Router loses the deep-linked URL, so a
  // refresh jumps back to the default tab ("Trackables"). Instead keep this
  // layout mounted and show an overlay until Convex identity + users.store are ready.

  if (!convexLoading && !convexAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  const sessionBootstrapBlocked =
    convexAuthenticated &&
    (profile === undefined || profile === null);

  const pendingApprovalBlocked =
    !convexLoading &&
    convexAuthenticated &&
    profile !== undefined &&
    profile !== null &&
    !isApproved;

  if (pendingApprovalBlocked) {
    return <Redirect href="/(auth)/pending-approval" />;
  }

  const overlayBlocked =
    convexLoading ||
    sessionBootstrapBlocked;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <NavPathTrace />
      <TimerDisplay />
      <DesktopAppChromeProvider>
        <View style={{ flex: 1 }}>
          {isDesktop ? <DesktopAppTopBar /> : null}
          <View style={{ flex: 1, minHeight: 0 }}>
            <NavTreeProfiler id="(app)/Drawer">
              <Drawer
                drawerContent={CustomDrawerContent}
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
                <Drawer.Screen name="inbox" options={{ title: "Inbox" }} />
                <Drawer.Screen name="tags" options={{ title: "Tags" }} />
                <Drawer.Screen name="lists" options={{ title: "Lists" }} />
                <Drawer.Screen name="shared" options={{ title: "Shared" }} />
                <Drawer.Screen
                  name="edit-trackable"
                  options={{ title: "Edit Goal" }}
                />
              </Drawer>
            </NavTreeProfiler>
          </View>
        </View>
      </DesktopAppChromeProvider>
      {overlayBlocked && (
        <View
          style={styles.bootstrapOverlay}
          pointerEvents="auto"
        >
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      )}
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
  bootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
