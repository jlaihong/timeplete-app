import { FontSize, Radius } from "../../theme/tokens";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Drawer } from "expo-router/drawer";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  SafeAreaInsetsContext,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
} from "react-native";
import { type DrawerContentComponentProps } from "@react-navigation/drawer";
import { router, Redirect, useRouter, useSegments, useNavigationContainerRef, type Href } from "expo-router";
import { useAuth } from "../../hooks/useAuth";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { useDrawerSelection } from "../../hooks/useDrawerSelection";
import { useOutboxReplay } from "../../hooks/useOutboxReplay";
import { TimerDisplay } from "../../components/timer/TimerDisplay";
import { TimerCheckInGate } from "../../components/timer/TimerCheckInGate";
import { TimerNotifications } from "../../components/timer/TimerNotifications";
import { SiriAddToListHost } from "../../components/siri/SiriAddToListHost";
import {
  DesktopAppChromeProvider,
  SIDEBAR_RAIL_WIDTH,
  SIDEBAR_WIDTH,
  useDesktopAppChrome,
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

/**
 * One sidebar row. Memoized with stable callbacks so only the rows whose
 * `focused` state actually changes re-render on a sidebar click. Without
 * this the entire sidebar (10+ items + N user lists) re-renders on every
 * navigation — the profiler caught a 47-72ms Drawer phase=update which
 * dominated the longtask blocking the main thread between click and first
 * paint.
 *
 * `rail` is the folded desktop sidebar (icon only); `touch` is the phone
 * drawer, which keeps finger-sized rows.
 */
type NavRowProps = {
  label: string;
  focused: boolean;
  onPress: () => void;
  iconName?: keyof typeof Ionicons.glyphMap;
  /** Lists show their colour as a dot instead of a glyph. */
  dotColour?: string;
  rail?: boolean;
  touch?: boolean;
};

/** Web: a native tooltip, for the icon rail and for truncated list names. */
function setTitleAttribute(label: string) {
  return (node: unknown) => {
    if (Platform.OS !== "web") return;
    (node as { setAttribute?: (k: string, v: string) => void } | null)
      ?.setAttribute?.("title", label);
  };
}

/**
 * Web: set by a sidebar row when it is Cmd/Ctrl-clicked or middle-clicked,
 * and read (then cleared) by `go`, which opens the page in a new browser
 * tab instead of navigating this one.
 */
let openNextInNewTab = false;

function wantsNewTab(e: unknown): boolean {
  if (Platform.OS !== "web") return false;
  const ev = e as {
    metaKey?: boolean;
    ctrlKey?: boolean;
    nativeEvent?: { metaKey?: boolean; ctrlKey?: boolean };
  } | null;
  return !!(
    ev?.metaKey ||
    ev?.ctrlKey ||
    ev?.nativeEvent?.metaKey ||
    ev?.nativeEvent?.ctrlKey
  );
}

const NavRow = React.memo(function NavRow({
  label,
  focused,
  onPress,
  iconName,
  dotColour,
  rail = false,
  touch = false,
}: NavRowProps) {
  const onPressRef = useRef(onPress);
  onPressRef.current = onPress;
  const titleRef = useMemo(() => {
    const setTitle = setTitleAttribute(label);
    return (node: unknown) => {
      setTitle(node);
      if (Platform.OS !== "web" || !node) return;
      const el = node as HTMLElement & { __auxClickBound?: boolean };
      if (el.__auxClickBound) return;
      el.__auxClickBound = true;
      // Middle-click opens in a new tab, as it does for a link.
      (node as HTMLElement).addEventListener("auxclick", (e) => {
        if ((e as MouseEvent).button !== 1) return;
        e.preventDefault();
        openNextInNewTab = true;
        onPressRef.current();
      });
    };
  }, [label]);
  return (
    <Pressable
      ref={titleRef as never}
      onPress={(e) => {
        openNextInNewTab = wantsNewTab(e);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      style={(state) => [
        styles.row,
        touch && styles.rowTouch,
        rail && styles.rowRail,
        ((state as { hovered?: boolean }).hovered || state.pressed) &&
          styles.rowHover,
        focused && styles.rowActive,
      ]}
    >
      <View style={styles.rowIconSlot}>
        {dotColour ? (
          <View style={[styles.listDot, { backgroundColor: dotColour }]} />
        ) : iconName ? (
          <Ionicons
            name={iconName}
            size={touch ? 20 : 18}
            color={focused ? Colors.primary : Colors.textSecondary}
          />
        ) : null}
      </View>
      {!rail && (
        <Text
          style={[
            styles.rowLabel,
            touch && styles.rowLabelTouch,
            focused && styles.rowLabelActive,
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
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
    if (openNextInNewTab) {
      openNextInNewTab = false;
      if (Platform.OS === "web" && typeof href === "string") {
        window.open(expoHrefToBrowserPath(href), "_blank");
        return;
      }
    }
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
  const navigationContainerRef = useNavigationContainerRef();
  const { profileReady } = useAuth();
  const isDesktop = useIsDesktop();
  const insets = useSafeAreaInsets();
  const { sidebarCollapsed, setSidebarCollapsed } = useDesktopAppChrome();
  const sel = useDrawerSelection();
  const expoRouter = useRouter();
  const segments = useSegments();
  const lists = useQuery(api.lists.search, profileReady ? {} : "skip");

  /** Desktop sidebar folded down to icons. */
  const rail = isDesktop && sidebarCollapsed;
  /** Phone drawer: finger-sized rows. */
  const touch = !isDesktop;

  // The drawer's open/closed status is fixed from the first render, so a
  // window that loads narrow and is then widened would keep a "closed"
  // desktop sidebar — hidden, with nothing on screen to bring it back.
  // On desktop the sidebar only ever folds to the rail, so force it open.
  useEffect(() => {
    if (isDesktop) navigation.openDrawer();
    else navigation.closeDrawer();
  }, [isDesktop, navigation]);

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

  // Only hand-made lists. A trackable's own list would otherwise repeat the
  // whole Trackables page here and bury lists like "Groceries"; those open
  // from the trackable, or from Manage. The one being viewed still shows,
  // so the sidebar always marks where you are.
  const activeListId = sel.activeListId;
  const sidebarLists = useMemo(() => {
    if (!lists) return null;
    return lists.filter(
      (l) =>
        !l.archived &&
        !l.isInbox &&
        // The list's own "Show in sidebar" switch.
        (l.showInSidebar !== false || l._id === activeListId) &&
        (!l.isGoalList || l._id === activeListId),
    );
  }, [lists, activeListId]);

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
  // also stay stable, so memoized `NavRow`s don't re-render on every
  // navigation.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const go = useCallback(buildStableGo(envRef), []);

  const onHome = useCallback(() => go("/(app)/(tabs)"), [go]);
  const onTrackables = useCallback(() => go("/(app)/(tabs)/goals"), [go]);
  const onAnalytics = useCallback(() => go("/(app)/(tabs)/analytics"), [go]);
  const onReviews = useCallback(() => go("/(app)/(tabs)/reviews"), [go]);
  const onTags = useCallback(() => go("/(app)/tags"), [go]);
  const onSettings = useCallback(() => go("/(app)/settings"), [go]);
  const onAllLists = useCallback(() => go("/(app)/lists"), [go]);
  const onShared = useCallback(() => go("/(app)/shared"), [go]);
  const inboxId = inboxList?._id ?? null;
  const onInbox = useCallback(() => {
    if (inboxId) go(`/(app)/lists/${inboxId}`);
  }, [go, inboxId]);

  // Stable per-list onPress map: looked up by list id. The map itself is
  // recreated when the list set changes, but the *individual* callbacks
  // stay stable across renders within that set so list rows can skip
  // re-rendering when only the focused id changed.
  const listOnPressMap = useMemo(() => {
    const map = new Map<string, () => void>();
    if (sidebarLists) {
      for (const list of sidebarLists) {
        map.set(list._id, () => go(`/(app)/lists/${list._id}`));
      }
    }
    return map;
  }, [sidebarLists, go]);

  const toggleLabel = rail ? "Expand sidebar" : "Collapse sidebar";
  const toggleTitleRef = useMemo(
    () => setTitleAttribute(toggleLabel),
    [toggleLabel],
  );

  return (
    <View
      style={[
        styles.drawer,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      {/* Brand + fold toggle. On desktop this replaces the old full-width
          top bar, which spent a 56px strip of every page on the app name. */}
      <View style={[styles.brandRow, rail && styles.brandRowRail]}>
        {!rail && (
          <View style={styles.brand}>
            <Text style={styles.brandText}>Timeplete</Text>
            <View style={styles.betaPill}>
              <Text style={styles.betaLabel}>Beta</Text>
            </View>
          </View>
        )}
        {isDesktop && (
          <Pressable
            ref={toggleTitleRef as never}
            onPress={() => setSidebarCollapsed(!sidebarCollapsed)}
            accessibilityRole="button"
            accessibilityLabel={toggleLabel}
            style={(state) => [
              styles.toggle,
              ((state as { hovered?: boolean }).hovered || state.pressed) &&
                styles.rowHover,
            ]}
          >
            <MaterialIcons
              name={rail ? "menu" : "menu-open"}
              size={20}
              color={Colors.textSecondary}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.group}>
        <NavRow
          label="Home"
          focused={sel.home}
          iconName="home-outline"
          onPress={onHome}
          rail={rail}
          touch={touch}
        />
        {inboxList ? (
          <NavRow
            label="Inbox"
            focused={sel.inbox}
            iconName="file-tray-outline"
            onPress={onInbox}
            rail={rail}
            touch={touch}
          />
        ) : null}
        <NavRow
          label="Trackables"
          focused={sel.goals}
          iconName="trophy-outline"
          onPress={onTrackables}
          rail={rail}
          touch={touch}
        />
        <NavRow
          label="Analytics"
          focused={sel.analytics}
          iconName="bar-chart-outline"
          onPress={onAnalytics}
          rail={rail}
          touch={touch}
        />
        <NavRow
          label="Reviews"
          focused={sel.reviews}
          iconName="journal-outline"
          onPress={onReviews}
          rail={rail}
          touch={touch}
        />
        <NavRow
          label="Tags"
          focused={sel.tags}
          iconName="pricetag-outline"
          onPress={onTags}
          rail={rail}
          touch={touch}
        />
        {rail && (
          <NavRow
            label="All lists"
            focused={sel.allLists || sel.activeListId != null}
            iconName="list-outline"
            onPress={onAllLists}
            rail
          />
        )}
      </View>

      {/* Lists are the only part that scrolls, so the pages above and the
          account rows below stay put however many lists there are. */}
      {rail ? (
        <View style={styles.listsScroll} />
      ) : (
        <>
          <View style={styles.listsHeader}>
            <Text style={styles.sectionTitle}>Lists</Text>
            <Pressable
              onPress={onAllLists}
              accessibilityRole="button"
              accessibilityLabel="All lists"
              hitSlop={8}
              style={(state) => [
                styles.allListsLink,
                ((state as { hovered?: boolean }).hovered || state.pressed) &&
                  styles.rowHover,
                sel.allLists && styles.rowActive,
              ]}
            >
              <Text
                style={[
                  styles.allListsText,
                  sel.allLists && styles.rowLabelActive,
                ]}
              >
                Manage
              </Text>
            </Pressable>
          </View>
          <ScrollView
            style={styles.listsScroll}
            contentContainerStyle={styles.group}
            showsVerticalScrollIndicator={false}
          >
            {sidebarLists?.map(
              (list: { _id: string; name: string; colour: string }) => (
                <NavRow
                  key={list._id}
                  label={list.name}
                  dotColour={list.colour}
                  focused={sel.activeListId === list._id}
                  onPress={listOnPressMap.get(list._id)!}
                  touch={touch}
                />
              ),
            )}
          </ScrollView>
        </>
      )}

      <View style={[styles.group, styles.footer]}>
        <NavRow
          label="Shared with me"
          focused={sel.shared}
          iconName="people-outline"
          onPress={onShared}
          rail={rail}
          touch={touch}
        />
        <NavRow
          label="Settings"
          focused={sel.settings}
          iconName="settings-outline"
          onPress={onSettings}
          rail={rail}
          touch={touch}
        />
      </View>
    </View>
  );
}

function OutboxReplayHost() {
  useOutboxReplay();
  return null;
}

/**
 * The drawer navigator. Split out of `AppLayout` so it can read the
 * sidebar's folded state from `DesktopAppChromeProvider`.
 */
function AppDrawer({ isDesktop }: { isDesktop: boolean }) {
  const { sidebarCollapsed } = useDesktopAppChrome();
  const width = !isDesktop
    ? 264
    : sidebarCollapsed
      ? SIDEBAR_RAIL_WIDTH
      : SIDEBAR_WIDTH;
  return (
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
          width,
          borderRightWidth: 0,
        },
      }}
    >
      <Drawer.Screen name="(tabs)" />
      <Drawer.Screen name="inbox" options={{ title: "Inbox" }} />
      <Drawer.Screen name="tags" options={{ title: "Tags" }} />
      <Drawer.Screen name="lists" options={{ title: "Lists" }} />
      <Drawer.Screen name="shared" options={{ title: "Shared" }} />
      <Drawer.Screen name="settings" options={{ title: "Settings" }} />
      <Drawer.Screen name="agent" options={{ title: "Settings" }} />
      <Drawer.Screen
        name="edit-trackable"
        options={{ title: "Edit Trackable" }}
      />
    </Drawer>
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
    return (
      <Redirect href={Platform.OS === "web" ? "/landing" : "/(auth)/login"} />
    );
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
          <View style={{ flex: 1, minHeight: 0 }}>
            <NavTreeProfiler id="(app)/Drawer">
              <AppDrawer isDesktop={isDesktop} />
            </NavTreeProfiler>
          </View>
        </View>
      </DesktopAppChromeProvider>
      </SafeAreaInsetsContext.Provider>
      {/* Durable mutation outbox replay after auth (renders nothing). */}
      {profile != null && isApproved ? <OutboxReplayHost /> : null}
      {profile != null && isApproved ? <SiriAddToListHost /> : null}
      {/* Long-running-timer check-ins — overlays every screen. */}
      <TimerCheckInGate />
      {/* Reminder notifications for the check-ins (renders nothing). */}
      <TimerNotifications />
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
  brandRow: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 18,
    paddingRight: 10,
  },
  brandRowRail: { justifyContent: "center", paddingLeft: 0, paddingRight: 0 },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 },
  brandText: {
    fontSize: FontSize.bodyLarge,
    fontWeight: "700",
    color: Colors.text,
    letterSpacing: -0.3,
  },
  betaPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
  },
  betaLabel: {
    fontSize: FontSize.micro,
    fontWeight: "700",
    color: Colors.textSecondary,
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  toggle: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  group: { paddingHorizontal: 8, gap: 2 },
  row: {
    height: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    borderRadius: Radius.md,
  },
  rowTouch: { height: 46, gap: 14, paddingHorizontal: 12 },
  rowRail: { justifyContent: "center", paddingHorizontal: 0 },
  rowHover: { backgroundColor: Colors.sidenavItemHover },
  rowActive: { backgroundColor: Colors.sidenavItemActive },
  rowIconSlot: { width: 20, alignItems: "center", justifyContent: "center" },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: FontSize.body,
    color: Colors.textSecondary,
  },
  rowLabelTouch: { fontSize: FontSize.bodyLarge },
  rowLabelActive: { color: Colors.text, fontWeight: "600" },
  listsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    marginBottom: 4,
    paddingLeft: 18,
    paddingRight: 10,
  },
  sectionTitle: {
    fontSize: FontSize.caption,
    fontWeight: "600",
    color: Colors.textTertiary,
  },
  allListsLink: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.md,
  },
  allListsText: { fontSize: FontSize.caption, color: Colors.textTertiary },
  listsScroll: { flex: 1, minHeight: 0 },
  footer: {
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.outlineVariant,
  },
  listDot: {
    width: 8,
    height: 8,
    borderRadius: Radius.pill,
  },
  bootstrapOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: Colors.background,
  },
});
