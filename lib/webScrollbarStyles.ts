import { Platform } from "react-native";
import { Colors } from "@/constants/colors";

const STYLE_ID = "timeplete-nonmac-scrollbar";

/**
 * macOS Chrome uses overlay scrollbars that stay out of the way; Linux/Windows
 * default to classic scrollbars that are wide and harsh. We only install custom
 * styling on non-macOS web so macOS keeps native behavior.
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

/**
 * Installs global scrollbar appearance for react-native-web `ScrollView` and
 * other overflow regions (Chrome/Safari: webkit; Firefox: scrollbar-width).
 */
export function installWebScrollbarStyles(): void {
  if (Platform.OS !== "web") return;
  if (typeof document === "undefined") return;
  if (shouldUseSystemScrollbars()) return;
  if (document.getElementById(STYLE_ID)) return;

  const thumb = Colors.outlineVariant;
  const thumbHover = Colors.outline;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    * {
      scrollbar-width: thin;
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
      background-color: ${thumb};
      border-radius: 9999px;
    }
    *::-webkit-scrollbar-thumb:hover {
      background-color: ${thumbHover};
    }
  `;
  document.head.appendChild(style);
}
