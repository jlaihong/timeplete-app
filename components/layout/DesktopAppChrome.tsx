import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SIDEBAR_COLLAPSED_KEY = "nav.sidebarCollapsed";

/** Desktop sidebar widths: full, and folded down to an icon rail. */
export const SIDEBAR_WIDTH = 232;
export const SIDEBAR_RAIL_WIDTH = 56;

type DesktopAppChromeContextValue = {
  /** Desktop only: the sidebar is folded down to an icon rail. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
};

const DesktopAppChromeContext = createContext<DesktopAppChromeContextValue>({
  sidebarCollapsed: false,
  setSidebarCollapsed: () => {},
});

/**
 * Owns the desktop sidebar's folded state. It lives above `<Drawer>` because
 * both the navigator (drawer width) and the drawer content (rail vs. full
 * rows) need it. The choice is remembered per device.
 */
export function DesktopAppChromeProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarCollapsed, setCollapsedState] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      .then((stored) => {
        if (!cancelled && stored === "1") setCollapsedState(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setSidebarCollapsed = useCallback((collapsed: boolean) => {
    setCollapsedState(collapsed);
    AsyncStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0").catch(
      () => {},
    );
  }, []);

  const value = useMemo(
    () => ({ sidebarCollapsed, setSidebarCollapsed }),
    [sidebarCollapsed, setSidebarCollapsed],
  );

  return (
    <DesktopAppChromeContext.Provider value={value}>
      {children}
    </DesktopAppChromeContext.Provider>
  );
}

export function useDesktopAppChrome(): DesktopAppChromeContextValue {
  return useContext(DesktopAppChromeContext);
}
