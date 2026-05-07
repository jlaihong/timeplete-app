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
import {
  DrawerActions,
  useIsFocused,
  useNavigation,
} from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Colors } from "../../constants/colors";
import { useIsDesktop } from "../../hooks/useIsDesktop";
import { DesktopBrandedHeaderTitle } from "./DesktopBrandedHeaderTitle";

type DesktopAppChromeContextValue = {
  subtitle: string | undefined;
  setSubtitle: (subtitle: string | undefined) => void;
};

const DesktopAppChromeContext =
  createContext<DesktopAppChromeContextValue | null>(null);

export function DesktopAppChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [subtitle, setSubtitleState] = useState<string | undefined>();

  const setSubtitle = useCallback((next: string | undefined) => {
    setSubtitleState(next);
  }, []);

  const value = useMemo(
    () => ({ subtitle, setSubtitle }),
    [subtitle, setSubtitle],
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
 * Registers the desktop app-bar subtitle for the currently focused route.
 * Uses navigation focus so inactive drawer/tabs do not clobber the title.
 */
export function useRegisterDesktopSubtitle(subtitle: string) {
  const isDesktop = useIsDesktop();
  const { setSubtitle } = useDesktopAppChrome();
  const isFocused = useIsFocused();

  useLayoutEffect(() => {
    if (!isDesktop || !isFocused) {
      return undefined;
    }
    setSubtitle(subtitle);
    return () => setSubtitle(undefined);
  }, [isDesktop, isFocused, subtitle, setSubtitle]);
}

/**
 * Full-viewport-width desktop toolbar above the drawer + main pane stack.
 * Matches productivity-one: toolbar spans sidebar + content, not just the content column.
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
        onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
        style={styles.menuBtn}
        accessibilityRole="button"
        accessibilityLabel="Open navigation menu"
      >
        <Ionicons name="menu" size={24} color={Colors.text} />
      </TouchableOpacity>
      <View style={styles.titleSlot}>
        <DesktopBrandedHeaderTitle subtitle={ctx.subtitle} />
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
