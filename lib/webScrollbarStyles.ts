import { Platform } from "react-native";
import { Colors } from "@/constants/colors";

const STYLE_ID = "timeplete-nonmac-scrollbar";
const HISTORY_SCROLL_STYLE_ID = "timeplete-tracking-history-scrollbar";

/** DOM marker for Tracking history grids so CSS can pin always-visible thumbs (must match stylesheet). */
export const TRACKING_HISTORY_SCROLL_ATTR_NAME = "data-tracking-history-scroll";

/** Web: spread onto Tracking history tab `ScrollView`s (react-native-web forwards to scroll div). */
export function trackingHistoryScrollViewDomProps(): Record<string, string> {
  if (Platform.OS !== "web") return {};
  return { [TRACKING_HISTORY_SCROLL_ATTR_NAME]: "true" };
}

/** Applied to overflow elements while (or briefly after) the user scrolls them. */
const SCROLL_REVEAL_CLASS = "timeplete-scrollbar-reveal";
const SCROLL_REVEAL_MS = 650;

let scrollRevealCleanup: (() => void) | null = null;

/**
 * macOS Chrome/Safari use overlay scrollbars; Linux/Windows often show chunky
 * persistent thumbs. Our non-mac rules keep thumbs transparent until hover,
 * focus-within, or an active scroll (mirroring overlay behavior reasonably well).
 */
function shouldUseSystemScrollbars(): boolean {
  if (typeof navigator === "undefined") return true;
  if (/Mac OS X|mac OS X|macOS/i.test(navigator.userAgent)) return true;
  const ud = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  if (ud?.platform === "macOS") return true;
  return false;
}

function installScrollRevealListener(): () => void {
  const timers = new Map<Element, ReturnType<typeof setTimeout>>();
  const onScroll = (e: Event) => {
    const raw = e.target;
    const el =
      raw === document.documentElement
        ? document.documentElement
        : raw instanceof Element
          ? raw
          : null;
    if (!el) return;

    el.classList.add(SCROLL_REVEAL_CLASS);

    const prev = timers.get(el);
    if (prev) clearTimeout(prev);
    timers.set(
      el,
      setTimeout(() => {
        el.classList.remove(SCROLL_REVEAL_CLASS);
        timers.delete(el);
      }, SCROLL_REVEAL_MS),
    );
  };

  window.addEventListener("scroll", onScroll, true);
  return () => {
    window.removeEventListener("scroll", onScroll, true);
    timers.forEach((t) => clearTimeout(t));
    timers.clear();
  };
}

/**
 * Persistent scrollbar on Edit Trackable “Tracking history” panes — overrides translucent
 * `*` scrollbar rules without requiring hover/wheel flicker so users can grab the thumb.
 */
function installTrackingHistoryScrollbarStyles(): () => void {
  if (typeof document === "undefined") return () => {};

  if (!document.getElementById(HISTORY_SCROLL_STYLE_ID)) {
    const thumb = Colors.outlineVariant;
    const thumbHover = Colors.outline;
    const track = Colors.surfaceContainer;
    const sel = `[${TRACKING_HISTORY_SCROLL_ATTR_NAME}]`;

    const style = document.createElement("style");
    style.id = HISTORY_SCROLL_STYLE_ID;
    style.textContent = `
${sel} {
  scrollbar-width: thin !important;
  scrollbar-color: ${thumb} ${track} !important;
}
${sel}::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}
${sel}::-webkit-scrollbar-track {
  background-color: ${track};
  border-radius: 999px;
}
${sel}::-webkit-scrollbar-thumb {
  background-color: ${thumb} !important;
  border-radius: 999px;
}
${sel}::-webkit-scrollbar-thumb:hover {
  background-color: ${thumbHover} !important;
}
`;
    document.head.appendChild(style);
  }

  return () => {
    document.getElementById(HISTORY_SCROLL_STYLE_ID)?.remove();
  };
}

function installNonMacUniversalScrollbarStyles(): () => void {
  if (typeof document === "undefined") return () => {};
  if (shouldUseSystemScrollbars()) return () => {};

  scrollRevealCleanup?.();
  scrollRevealCleanup = installScrollRevealListener();

  if (!document.getElementById(STYLE_ID)) {
    const thumb = Colors.outlineVariant;
    const thumbHover = Colors.outline;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    * {
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
    }
    *:hover,
    *:focus-within {
      scrollbar-color: ${thumb} transparent;
    }
    .${SCROLL_REVEAL_CLASS} {
      scrollbar-color: ${thumb} transparent;
    }

    *::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    *::-webkit-scrollbar-track {
      background: transparent;
    }
    *::-webkit-scrollbar-corner {
      background: transparent;
    }
    *::-webkit-scrollbar-thumb {
      background-color: transparent;
      border-radius: 9999px;
    }
    *:hover::-webkit-scrollbar-thumb,
    *:focus-within::-webkit-scrollbar-thumb,
    .${SCROLL_REVEAL_CLASS}::-webkit-scrollbar-thumb {
      background-color: ${thumb};
    }
    *:hover::-webkit-scrollbar-thumb:hover,
    *:focus-within::-webkit-scrollbar-thumb:hover,
    .${SCROLL_REVEAL_CLASS}::-webkit-scrollbar-thumb:hover {
      background-color: ${thumbHover};
    }
  `;
    document.head.appendChild(style);
  }

  return () => {
    scrollRevealCleanup?.();
    scrollRevealCleanup = null;
    document.getElementById(STYLE_ID)?.remove();
  };
}

/**
 * Installs global scrollbar appearance for react-native-web `ScrollView` and
 * other overflow regions (Chrome/Safari: webkit; Firefox: scrollbar-color).
 *
 * Non-mac: scrollbars stay hidden unless hover / focus-within / active scroll.
 * Edit Trackable Tracking history uses `trackingHistoryScrollViewDomProps()` for a
 * visible thumb independent of that behavior.
 */
export function installWebScrollbarStyles(): () => void {
  if (Platform.OS !== "web") return () => {};
  if (typeof document === "undefined") return () => {};

  const cleanups: Array<() => void> = [
    installTrackingHistoryScrollbarStyles(),
    installNonMacUniversalScrollbarStyles(),
  ];

  return () => {
    cleanups.forEach((c) => c());
  };
}
