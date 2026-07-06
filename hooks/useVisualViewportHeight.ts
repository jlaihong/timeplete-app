import { useEffect, useState } from "react";
import { Platform } from "react-native";

/**
 * Returns the height of the currently *visible* viewport in CSS pixels, or
 * `undefined` when unavailable (non-web, SSR, ancient browsers).
 *
 * ## Why this exists
 * Our dialog overlays are `position: fixed; top:0; bottom:0`, which sizes
 * them against the **layout viewport**. On mobile web the layout viewport
 * doesn't shrink when the software keyboard opens — iOS Safari treats the
 * keyboard as an *overlay*, and Chrome/Android does the same unless the
 * page opts in via `interactive-widget=resizes-content`. Result: the
 * dialog's bottom (and any inputs stacked there) slides underneath the
 * keyboard and can no longer be reached, tapped, or scrolled to.
 *
 * The `window.visualViewport` API exposes the *visual* viewport height,
 * which **does** shrink when the software keyboard is on-screen. We
 * subscribe to its `resize` events and expose that height so callers can
 * cap their overlay height and keep the entire form usable while the user
 * is typing.
 *
 * Native (iOS/Android) already gets equivalent behaviour from
 * `react-native-keyboard-controller` (`KeyboardProvider`,
 * `KeyboardAwareScrollView`, `KeyboardToolbar`), so this hook is a no-op
 * off the web.
 */
export function useVisualViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(() => {
    if (Platform.OS !== "web") return undefined;
    if (typeof window === "undefined") return undefined;
    return window.visualViewport?.height ?? window.innerHeight;
  });

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback: listen to plain window resizes so at least orientation
      // changes propagate, even though software keyboards won't.
      const onWinResize = () => setHeight(window.innerHeight);
      onWinResize();
      window.addEventListener("resize", onWinResize);
      return () => window.removeEventListener("resize", onWinResize);
    }
    const update = () => setHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    // iOS Safari also fires `scroll` when the visual viewport translates
    // (e.g. when the keyboard is shown and the page is auto-scrolled to
    // reveal the focused input) — treat that as a height update too.
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return height;
}
