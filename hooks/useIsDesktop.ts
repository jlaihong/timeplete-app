import { useWindowDimensions, Platform } from "react-native";

const DESKTOP_BREAKPOINT = 768;
const WIDE_BREAKPOINT = 1200;

/**
 * Drawer navigator reads `defaultStatus` from the first render only (`useLazyValue`
 * in `useNavigationBuilder`). On web, RN's window width can briefly be 0 or behind
 * `window.innerWidth` for a frame, which locks `defaultStatus: "closed"` while the
 * UI is actually desktop — then permanent-drawer toggle state stays wrong.
 */
function effectiveViewportWidthForBreakpoints(rnWidth: number): number {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return Math.max(rnWidth, window.innerWidth);
  }
  return rnWidth;
}

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  // Native (iPhone, iPad, Android) always uses the mobile navigator.
  // "Desktop" chrome — permanent drawer, DesktopHome, dnd-kit `<div>`
  // rows — is DOM-only. On RN it crashes with:
  // "View config getter callback for component `div`" and the process
  // dies, which looks like an instant sign-out on iPad (width ≥ 768).
  if (Platform.OS !== "web") {
    return false;
  }
  return effectiveViewportWidthForBreakpoints(width) >= DESKTOP_BREAKPOINT;
}

export function useResponsiveBreakpoints() {
  const { width } = useWindowDimensions();
  const w = effectiveViewportWidthForBreakpoints(width);
  const isDesktop = Platform.OS === "web" && w >= DESKTOP_BREAKPOINT;
  return {
    isDesktop,
    isWide: w >= WIDE_BREAKPOINT,
    width,
  };
}
