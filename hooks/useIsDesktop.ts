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
  return effectiveViewportWidthForBreakpoints(width) >= DESKTOP_BREAKPOINT;
}

export function useResponsiveBreakpoints() {
  const { width } = useWindowDimensions();
  const w = effectiveViewportWidthForBreakpoints(width);
  return {
    isDesktop: w >= DESKTOP_BREAKPOINT,
    isWide: w >= WIDE_BREAKPOINT,
    width,
  };
}
