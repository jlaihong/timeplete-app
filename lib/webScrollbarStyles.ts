import { Platform } from "react-native";
import { Colors } from "@/constants/colors";

/**
 * Opts the RN-web `ScrollView` host (see `TrackingHistoryScroller.web.tsx`) out of
 * translucent-scrollbar rules below so the browser paints a normal scrollbar.
 *
 * Must stay in sync with `dataSet.trackingHistoryScroll` there (RN-web →
 * `data-tracking-history-scroll` on the **scroll host** — the same `View` that
 * `ScrollViewBase` wires `scrollRef` / `overflow` to).
 */
const TRACKING_HISTORY_EXCLUDED = "[data-tracking-history-scroll]";

const STYLE_ID = "timeplete-nonmac-scrollbar-v2";

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

function installNonMacUniversalScrollbarStyles(): () => void {
  if (typeof document === "undefined") return () => {};
  if (shouldUseSystemScrollbars()) return () => {};

  scrollRevealCleanup?.();
  scrollRevealCleanup = installScrollRevealListener();

  if (!document.getElementById(STYLE_ID)) {
    const thumb = Colors.outlineVariant;
    const thumbHover = Colors.outline;
    const ns = `*:not(${TRACKING_HISTORY_EXCLUDED})`;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
    ${ns} {
      scrollbar-width: thin;
      scrollbar-color: transparent transparent;
    }
    ${ns}:hover,
    ${ns}:focus-within {
      scrollbar-color: ${thumb} transparent;
    }
    .${SCROLL_REVEAL_CLASS}:not(${TRACKING_HISTORY_EXCLUDED}) {
      scrollbar-color: ${thumb} transparent;
    }

    ${ns}::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ${ns}::-webkit-scrollbar-track {
      background: transparent;
    }
    ${ns}::-webkit-scrollbar-corner {
      background: transparent;
    }
    ${ns}::-webkit-scrollbar-thumb {
      background-color: transparent;
      border-radius: 9999px;
    }
    ${ns}:hover::-webkit-scrollbar-thumb,
    ${ns}:focus-within::-webkit-scrollbar-thumb,
    .${SCROLL_REVEAL_CLASS}:not(${TRACKING_HISTORY_EXCLUDED})::-webkit-scrollbar-thumb {
      background-color: ${thumb};
    }
    ${ns}:hover::-webkit-scrollbar-thumb:hover,
    ${ns}:focus-within::-webkit-scrollbar-thumb:hover,
    .${SCROLL_REVEAL_CLASS}:not(${TRACKING_HISTORY_EXCLUDED})::-webkit-scrollbar-thumb:hover {
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
 * Non-mac: scrollbars stay hidden until hover / focus-within / active scroll,
 * except **Edit Trackable → Tracking history**, which is excluded via
 * `data-tracking-history-scroll` so the real scroll host keeps native-visible
 * scrollbars (and is not forced to `scrollbar-width: none` — both indicator
 * props must be true on that `ScrollView`; see `EditTrackableHistoryTab`).
 */
export function installWebScrollbarStyles(): () => void {
  if (Platform.OS !== "web") return () => {};
  if (typeof document === "undefined") return () => {};

  return installNonMacUniversalScrollbarStyles();
}
