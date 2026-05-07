import React, {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { View, StyleSheet, TouchableOpacity, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DrawerNavigationHelpers } from "@react-navigation/drawer";
import {
  DrawerActions,
  type NavigationProp,
  type ParamListBase,
  useNavigation,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { DesktopBrandedHeaderTitle } from "./DesktopBrandedHeaderTitle";

type DesktopAppChromeContextValue = {
  drawerNavigation: DrawerNavigationHelpers | null;
  setDrawerNavigation: (nav: DrawerNavigationHelpers | null) => void;
};

const DesktopAppChromeContext =
  createContext<DesktopAppChromeContextValue | null>(null);

export function DesktopAppChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [drawerNavigation, setDrawerNavigationState] =
    useState<DrawerNavigationHelpers | null>(null);

  const setDrawerNavigation = useCallback(
    (nav: DrawerNavigationHelpers | null) => {
      setDrawerNavigationState(nav);
    },
    [],
  );

  const value = useMemo(
    () => ({
      drawerNavigation,
      setDrawerNavigation,
    }),
    [drawerNavigation, setDrawerNavigation],
  );

  return (
    <DesktopAppChromeContext.Provider value={value}>
      {children}
    </DesktopAppChromeContext.Provider>
  );
}

function useDesktopAppChrome(): DesktopAppChromeContextValue {
  const ctx = useContext(DesktopAppChromeContext);
  if (!ctx) {
    throw new Error(
      "Desktop chrome hooks must be used within DesktopAppChromeProvider",
    );
  }
  return ctx;
}

/**
 * Bind the drawer navigator instance into desktop chrome. Call from
 * `DrawerContentComponentProps` — that object is the authoritative drawer
 * navigation target (the top bar renders outside `<Drawer>`).
 */
export function useRegisterDrawerNavigationForDesktopChrome(
  drawerNav: DrawerNavigationHelpers,
) {
  const { setDrawerNavigation } = useDesktopAppChrome();

  useLayoutEffect(() => {
    setDrawerNavigation(drawerNav);
    return () => setDrawerNavigation(null);
  }, [drawerNav, setDrawerNavigation]);
}

/**
 * Desktop toolbar renders beside `<Drawer>`, not inside it, so the default
 * `useNavigation()` target is usually a parent stack — not the drawer.
 * Walk ancestors until we find the drawer navigator, then toggle there.
 */
function dispatchDrawerToggle(navigation: NavigationProp<ParamListBase>) {
  let nav: NavigationProp<ParamListBase> | undefined = navigation;
  for (let depth = 0; depth < 16 && nav != null; depth++) {
    const state = nav.getState();
    if (
      state &&
      typeof state === "object" &&
      "type" in state &&
      (state as { type?: string }).type === "drawer"
    ) {
      nav.dispatch(DrawerActions.toggleDrawer());
      return;
    }
    nav = nav.getParent?.();
  }
  navigation.dispatch(DrawerActions.toggleDrawer());
}

/**
 * Full-viewport-width desktop toolbar above the drawer + main pane stack.
 * Matches productivity-one: toolbar spans sidebar + content, not just the content column.
 * Brand only — route titles stay in page chrome below (desktop).
 */
export function DesktopAppTopBar() {
  const isDesktop = useIsDesktop();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const ctx = useContext(DesktopAppChromeContext);

  if (!isDesktop || !ctx) {
    return null;
  }

  const paddingTop = Platform.OS === "web" ? 0 : insets.top;

  const onToggleDrawer = () => {
    if (ctx.drawerNavigation) {
      ctx.drawerNavigation.dispatch(DrawerActions.toggleDrawer());
      return;
    }
    dispatchDrawerToggle(navigation);
  };

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop,
          paddingBottom: 12,
          minHeight: 56 + paddingTop,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onToggleDrawer}
        style={styles.menuBtn}
        accessibilityRole="button"
        accessibilityLabel="Toggle navigation menu"
      >
        <Ionicons name="menu" size={24} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.titleSlot}>
        <DesktopBrandedHeaderTitle />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    alignSelf: "stretch",
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
    zIndex: 2,
  },
  menuBtn: {
    paddingLeft: 16,
    paddingRight: 8,
    justifyContent: "center",
    alignSelf: "stretch",
  },
  titleSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
});
