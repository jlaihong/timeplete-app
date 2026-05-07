import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { View, StyleSheet, Platform, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { DrawerNavigationProp } from "@react-navigation/drawer";
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
  /** Set synchronously from drawer content render so the out-of-tree top bar can toggle. */
  drawerNavigationRef: React.MutableRefObject<
    DrawerNavigationProp<ParamListBase> | null
  >;
};

const DesktopAppChromeContext =
  createContext<DesktopAppChromeContextValue | null>(null);

export function DesktopAppChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const drawerNavigationRef = useRef<DrawerNavigationProp<ParamListBase> | null>(
    null,
  );

  const value = useMemo(
    () => ({
      drawerNavigationRef,
    }),
    [],
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
  drawerNav: DrawerNavigationProp<ParamListBase>,
) {
  const { drawerNavigationRef } = useDesktopAppChrome();

  drawerNavigationRef.current = drawerNav;

  useLayoutEffect(() => {
    return () => {
      drawerNavigationRef.current = null;
    };
  }, [drawerNav, drawerNavigationRef]);
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
    const drawerNav = ctx.drawerNavigationRef.current;
    if (drawerNav) {
      drawerNav.dispatch(DrawerActions.toggleDrawer());
      return;
    }
    dispatchDrawerToggle(navigation as NavigationProp<ParamListBase>);
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
        accessibilityRole="button"
        accessibilityLabel="Toggle navigation menu"
        style={styles.menuBtn}
        activeOpacity={0.85}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
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
    marginLeft: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
      } as const,
      default: {},
    }),
  },
  titleSlot: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
});
