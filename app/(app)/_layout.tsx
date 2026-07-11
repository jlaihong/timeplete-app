import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
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
  expoHrefToBrowserPath,
  pushBrowserHistorySync,
  replaceBrowserHistorySync,
} from "../../lib/syncBrowserHistory";
import {
  logRouterInvoked,
  traceRouterDispatched,
  traceSidebarClick,
  traceSidebarClickFlushComplete,
} from "../../lib/navInstrumentation";

const drawerItemStyle = { borderRadius: 8 };

/**
 * `DrawerItem` from `@react-navigation/drawer` does shallow prop compare in its
 * memo wrapper. Wrapping with our own React.memo plus stable callbacks/icon
 * factories means only items whose `focused` state actually changes re-render
 * on a sidebar click. Without this the entire drawer (10+ items + N user
 * lists) re-renders on every navigation — the profiler caught a 47-72ms
 * Drawer phase=update which dominated the longtask blocking the main thread
 * between click and first paint.
 */
type NavDrawerItemProps = {
  label: string;
  focused: boolean;
  iconName: keyof typeof Ionicons.glyphMap;
  iconColor?: string;
  labelStyle?: { color?: string };
  onPress: () => void;
};

const NavDrawerItem = React.memo(function NavDrawerItem({
  label,
  focused,
  iconName,
  iconColor,
  labelStyle,
  onPress,
}: NavDrawerItemProps) {
  const icon = useCallback(
    ({ size, color }: { size: number; color: string }) => (
      <Ionicons
        name={iconName}
        size={size}
        color={iconColor ?? color}
      />
    ),
    [iconName, iconColor],
  );
  return (
    <DrawerItem
      label={label}
      focused={focused}
      activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
      inactiveTintColor={Colors.textSecondary}
      activeTintColor={Colors.textSecondary}
      style={drawerItemStyle}
      labelStyle={labelStyle}
      icon={icon}
      onPress={onPress}
    />
  );
});

type ListDrawerItemProps = {
  label: string;
  colour: string;
  focused: boolean;
  onPress: () => void;
};

/**
 * Per-list rows in the "My Lists" section. Same memoization rationale as
 * {@link NavDrawerItem}, plus the icon is a plain coloured dot (not an Ionic
 * glyph) so it has its own stable factory keyed on the list colour.
 */
const ListDrawerItem = React.memo(function ListDrawerItem({
  label,
  colour,
  focused,
  onPress,
}: ListDrawerItemProps) {
  const icon = useCallback(
    () => (
      <View style={[styles.listDot, { backgroundColor: colour }]} />
    ),
    [colour],
  );
  return (
    <DrawerItem
      label={label}
      focused={focused}
      activeBackgroundColor={Colors.sidenavItemSelectedHoverMatch}
      inactiveTintColor={Colors.textSecondary}
      activeTintColor={Colors.textSecondary}
      style={drawerItemStyle}
      icon={icon}
      onPress={onPress}
    />
  );
});

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

type DrawerGoEnv = {
  segments: readonly string[];
  isDesktop: boolean;
  navigation: DrawerContentComponentProps["navigation"];
  expoRouter: ReturnType<typeof useRouter>;
  navigationContainerRef: ReturnType<typeof useNavigationContainerRef>;
};

/**
 * `go()` reads `segments`, `isDesktop`, `navigation`, etc. — all of which
 * change across the lifetime of the drawer. If we listed them as deps the
 * callback identity would change on every nav and bust the per-item memos
 * (see {@link NavDrawerItem}). So we store the latest values in a ref the
 * outer component updates each render, and let `go` look them up through
 * the ref. Net effect: per-item `onPress` callbacks stay stable forever,
 * but `go` always sees fresh state.
 */
function buildStableGo(envRef: { current: DrawerGoEnv }): (href: Href) => void {
  return (href: Href) => {
    const { segments, isDesktop, navigation, expoRouter, navigationContainerRef } =
      envRef.current;
    const traceSeq = typeof href === "string" ? traceSidebarClick(href) : 0;
    const s = segments;
    const onListDetail =
      s[0] === "(app)" && s[1] === "lists" && typeof s[2] === "string";

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

    // See note in the original implementation: pushing browser history
    // synchronously here lands the URL bar update in the same task as
    // the click, ahead of React Navigation's deferred microtask.
    if (typeof href === "string") {
      const browserPath = expoHrefToBrowserPath(href);
      if (useReplace || useReplaceCrossGroup) {
        replaceBrowserHistorySync(browserPath);
      } else {
        pushBrowserHistorySync(browserPath);
      }
    }

    const dispatchNavigation = () => {
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
    };

    if (isDesktop) {
      dispatchNavigation();
      return;
    }

    // MOBILE ORDERING MATTERS: close the drawer BEFORE dispatching the
    // navigation. The flushed dispatch mounts the destination screen
    // synchronously (hundreds of ms of JS for heavy tabs), and when
    // `closeDrawer()` ran after it, the drawer sat frozen for that whole
    // render before retracting — the perceived "half second delay".
    // Closing first + deferring the dispatch one frame lets the retract
    // animation start (and, on native, run on the UI thread) while React
    // builds the new screen.
    navigation.closeDrawer();
    requestAnimationFrame(dispatchNavigation);
  };
}

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

  const envRef = useRef<DrawerGoEnv>({
    segments,
    isDesktop,
    navigation,
    expoRouter,
    navigationContainerRef,
  });
  envRef.current = {
    segments,
    isDesktop,
    navigation,
    expoRouter,
    navigationContainerRef,
  };
  // `go` is stable for the lifetime of the component — `useCallback` with
  // an empty dep array is intentional; everything mutable goes through
  // `envRef`. This is what unlocks the per-item `useCallback`s below to
  // also stay stable, so memoized `NavDrawerItem`s don't re-render on
  // every navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const go = useCallback(buildStableGo(envRef), []);

  const onHome = useCallback(() => go("/(app)/(tabs)"), [go]);
  const onTrackables = useCallback(() => go("/(app)/(tabs)/goals"), [go]);
  const onAnalytics = useCallback(() => go("/(app)/(tabs)/analytics"), [go]);
  const onReviews = useCallback(() => go("/(app)/(tabs)/reviews"), [go]);
  const onTags = useCallback(() => go("/(app)/tags"), [go]);
  const onAllLists = useCallback(() => go("/(app)/lists"), [go]);
  const onShared = useCallback(() => go("/(app)/shared"), [go]);
  const inboxId = inboxList?._id ?? null;
  const onInbox = useCallback(() => {
    if (inboxId) go(`/(app)/lists/${inboxId}`);
  }, [go, inboxId]);

  const onSignOut = useCallback(async () => {
    await authClient.signOut();
    navigation.closeDrawer();
    replaceBrowserHistorySync("/");
    router.replace("/");
    flushExpoRouterNavigationQueue(navigationContainerRef);
  }, [navigation, navigationContainerRef]);

  // Stable per-list onPress map: looked up by list id. The map itself is
  // recreated when the list set changes, but the *individual* callbacks
  // stay stable across renders within that set so `ListDrawerItem`s can
  // skip re-rendering when only the focused id changed.
  const listOnPressMap = useMemo(() => {
    const map = new Map<string, () => void>();
    if (sidebarLists) {
      for (const list of sidebarLists) {
        map.set(list._id, () => go(`/(app)/lists/${list._id}`));
      }
    }
    return map;
  }, [sidebarLists, go]);

  const signOutLabelStyle = useMemo(
    () => ({ color: Colors.error }),
    [],
  );

  return (
    <DrawerContentScrollView {...props} style={styles.drawer}>
      {!isDesktop && (
        <View style={styles.drawerHeader}>
          <Text style={styles.drawerTitle}>Timeplete</Text>
        </View>
      )}

      <NavDrawerItem
        label="Home"
        focused={sel.home}
        iconName="home-outline"
        onPress={onHome}
      />
      {inboxList ? (
        <NavDrawerItem
          label="Inbox"
          focused={sel.inbox}
          iconName="file-tray-outline"
          onPress={onInbox}
        />
      ) : null}
      <NavDrawerItem
        label="Trackables"
        focused={sel.goals}
        iconName="analytics-outline"
        onPress={onTrackables}
      />
      <NavDrawerItem
        label="Analytics"
        focused={sel.analytics}
        iconName="bar-chart-outline"
        onPress={onAnalytics}
      />

      {!isDesktop && (
        <NavDrawerItem
          label="Reviews"
          focused={sel.reviews}
          iconName="journal-outline"
          onPress={onReviews}
        />
      )}

      <NavDrawerItem
        label="Tags"
        focused={sel.tags}
        iconName="pricetag-outline"
        onPress={onTags}
      />

      <View style={styles.divider} />

      <Text style={styles.sectionTitle}>My Lists</Text>
      {sidebarLists &&
        sidebarLists.map(
          (list: { _id: string; name: string; colour: string }) => (
            <ListDrawerItem
              key={list._id}
              label={list.name}
              colour={list.colour}
              focused={sel.activeListId === list._id}
              onPress={listOnPressMap.get(list._id)!}
            />
          ),
        )}
      <NavDrawerItem
        label="All Lists"
        focused={sel.allLists}
        iconName="list-outline"
        onPress={onAllLists}
      />

      <View style={styles.divider} />

      <NavDrawerItem
        label="Shared with Me"
        focused={sel.shared}
        iconName="people-outline"
        onPress={onShared}
      />

      <View style={styles.divider} />

      <NavDrawerItem
        label="Sign Out"
        focused={false}
        iconName="log-out-outline"
        iconColor={Colors.error}
        labelStyle={signOutLabelStyle}
        onPress={onSignOut}
      />
    </DrawerContentScrollView>
  );
}

export default function AppLayout() {
  const isDesktop = useIsDesktop();
  const { isLoading: convexLoading, isAuthenticated: convexAuthenticated } =
    useConvexAuth();
  const { profile, isApproved } = useAuth();

  // ── Timer bar ↔ safe-area handoff ─────────────────────────────────
  // The app draws edge-to-edge, so the top safe-area inset (status bar)
  // is normally consumed by each screen's navigation header. When the
  // timer bar is visible it sits ABOVE the navigators and pads itself by
  // the inset (see TimerDisplay), so the headers below must stop adding
  // it — otherwise every page shows an extra inset-tall blank strip.
  // React Navigation reads insets from SafeAreaInsetsContext, so we
  // re-provide it with `top: 0` while the timer is running.
  //
  // Subscribes to `timers.get` directly (NOT useTimer) so this layout
  // re-renders on timer start/stop only — not on every 1-second tick.
  const insets = useSafeAreaInsets();
  const timerRow = useQuery(
    api.timers.get,
    profile != null ? {} : "skip",
  );
  const timerBarVisible = !!timerRow;
  const insetsBelowTimerBar = useMemo(
    () => (timerBarVisible ? { ...insets, top: 0 } : insets),
    [timerBarVisible, insets],
  );

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
      <SafeAreaInsetsContext.Provider value={insetsBelowTimerBar}>
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
      </SafeAreaInsetsContext.Provider>
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
