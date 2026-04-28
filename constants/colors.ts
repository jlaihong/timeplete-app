export const Colors = {
  primary: "#00DAF5",
  primaryDark: "#006876",
  primaryContainer: "#004E59",
  onPrimary: "#00363E",
  onPrimaryContainer: "#A0EFFF",

  secondary: "#9ACFDA",
  secondaryContainer: "#124E57",
  onSecondaryContainer: "#B6EBF7",

  tertiary: "#02E600",
  tertiaryContainer: "#015300",
  onTertiaryContainer: "#77FF61",

  background: "#0D1516",
  surface: "#0D1516",
  surfaceContainer: "#1A2122",
  surfaceContainerLow: "#161D1E",
  surfaceContainerHigh: "#242B2D",
  surfaceContainerHighest: "#2F3638",
  surfaceVariant: "#3B494C",

  text: "#DDE4E5",
  textSecondary: "#BAC9CD",
  textTertiary: "#859397",
  onSurfaceVariant: "#BAC9CD",

  outline: "#859397",
  outlineVariant: "#3B494C",
  border: "#3B494C",
  borderLight: "#242B2D",

  success: "#02E600",
  warning: "#F59E0B",
  error: "#FFB4AB",
  errorContainer: "#93000A",

  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",

  taskPanel: "#4F4F4F",
  appBackground: "#333333",

  /**
   * Productivity-one TopBar: solid #5B6E9E + #FFFFFF (App.css).
   * Companion solids below avoid washed-out rgba on the indigo rail.
   */
  productivityNav: "#5B6E9E",
  /** Darker indigo — dividers / pressed row (same hue as TopBar) */
  productivityNavDeep: "#4A5D85",
  productivityNavText: "#FFFFFF",
  /** Sidebar secondary labels — solid cool gray, not translucent white */
  productivityNavTextMuted: "#C9D3EE",

  sidenav: "#5B6E9E",
  sidenavItemHover: "#5269A3",
  /** Selected row — clearly darker than bar (TopBar has no equivalent; fits M3 nav) */
  sidenavItemActive: "#4A5D85",

  inverseSurface: "#DDE4E5",
  inverseOnSurface: "#2A3233",
  inversePrimary: "#006876",

  tab: {
    active: "#00DAF5",
    inactive: "#859397",
  },

  trackable: {
    number: "#6750A4",
    timeTrack: "#00DAF5",
    daysAWeek: "#02E600",
    minutesAWeek: "#F59E0B",
    tracker: "#E91E63",
  },
};

/**
 * App bar — match productivity-one TopBar (#5B6E9E + white title/actions).
 * Content below stays on Colors.background.
 */
export const stackHeaderChromeOptions = {
  headerShadowVisible: false,
  headerStyle: {
    backgroundColor: Colors.productivityNav,
    borderBottomWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: Colors.white,
  headerTitleStyle: {
    color: Colors.white,
    fontWeight: "600" as const,
  },
} as const;

export const TRACKABLE_COLORS = [
  "#6750A4",
  "#E91E63",
  "#00DAF5",
  "#02E600",
  "#F59E0B",
  "#FF6B6B",
  "#8B5CF6",
  "#14B8A6",
  "#F97316",
  "#06B6D4",
  "#84CC16",
  "#EF4444",
];
