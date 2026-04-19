import { Platform, ViewStyle } from "react-native";
import { Colors } from "../constants/colors";

/**
 * Material Design 3 elevation level 1 — the exact 3-layer shadow that
 * productivity-one's `mat-card` uses (`--mat-sys-level1`):
 *
 *   0px 2px 1px -1px rgba(0,0,0,0.2),
 *   0px 1px 1px 0px rgba(0,0,0,0.14),
 *   0px 1px 3px 0px rgba(0,0,0,0.12);
 *
 * On native we approximate with a single `shadow*` set since RN can't
 * stack multiple shadows on a `View`.
 */
export const level1Shadow = Platform.select<ViewStyle>({
  web: {
    boxShadow:
      "0 2px 1px -1px rgba(0,0,0,0.2), 0 1px 1px 0 rgba(0,0,0,0.14), 0 1px 3px 0 rgba(0,0,0,0.12)",
  } as unknown as ViewStyle,
  default: {
    elevation: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
}) as ViewStyle;

/**
 * Canonical "panel" / `mat-card` preset, matching productivity-one's
 * default elevated card surface exactly:
 *
 *   - background `#161D1E` (`--mat-sys-surface-container-low`)
 *   - 12px radius (`--mat-sys-corner-medium`)
 *   - level1 elevation shadow
 *   - NO border (Material's elevated card has no outline)
 *
 * Use for every "card surface" in the app — task panels, trackable
 * widgets, analytics widgets — so they share one source of truth.
 */
export const panelStyle: ViewStyle = {
  backgroundColor: Colors.surfaceContainerLow,
  borderRadius: 12,
  ...level1Shadow,
};

/** Default padding for a panel's content (mat-card-content). */
export const panelPadding = 16;

/** Vertical gap used when stacking panels in a list (`gap-3`). */
export const panelStackGap = 12;
