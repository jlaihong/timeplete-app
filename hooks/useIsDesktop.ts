import { useWindowDimensions } from "react-native";

const DESKTOP_BREAKPOINT = 768;
const WIDE_BREAKPOINT = 1200;

export function useIsDesktop(): boolean {
  const { width } = useWindowDimensions();
  return width >= DESKTOP_BREAKPOINT;
}

export function useResponsiveBreakpoints() {
  const { width } = useWindowDimensions();
  return {
    isDesktop: width >= DESKTOP_BREAKPOINT,
    isWide: width >= WIDE_BREAKPOINT,
    width,
  };
}
