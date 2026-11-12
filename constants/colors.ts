export const Colors = {
  primary: "#00DAF5",
  primaryDark: "#006876",
  primaryContainer: "#004E59",
  onPrimary: "#00363E",
  onPrimaryContainer: "#A0EFFF",

  secondary: "#9ACFDA",
  secondaryContainer: "#124E57",
  onSecondaryContainer: "#B6EBF7",

  tertiary: "#4ADE80",
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

  success: "#4ADE80",
  warning: "#F59E0B",
  error: "#FFB4AB",
  errorContainer: "#93000A",

  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",

  /**
   * Faint wash of the accent, for the one thing that is "live" on screen
   * (the row or card whose timer is running). Opaque so it can sit on any
   * surface, including under a swipe action.
   */
  accentWash: "#12292D",

  /** Destructive actions and "required" chart lines. */
  danger: "#EF4444",
  /** Fallback swatch for a task with no list, trackable or tag colour. */
  neutral: "#6B7280",
  /** Chart series when a widget plots count and time together. */
  chartCount: "#3B82F6",
  chartTime: "#10B981",

  /**
   * Same surface as trackable/task widgets (`theme/panels.ts` / surfaceContainerLow).
   * Used for drawer rail and stack headers.
   */
  sidenav: "#161D1E",
  sidenavItemHover: "#1A2122",
  /**
   * Sidebar row selected state on web should match `@react-navigation/drawer`
   * `DrawerItem`: `PlatformPressable` hover overlay at opacity 0.08 over the sidenav
   * using the inactive label tint (`textSecondary`). Composite of sidenav + 8% #BAC9CD.
   */
  sidenavItemSelectedHoverMatch: "#232B2C",
  /** Selected row — slightly elevated vs panel */
  sidenavItemActive: "#242B2D",

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

/** Stack / tab headers — same panel surface as trackable widgets. */
export const stackHeaderChromeOptions = {
  headerShadowVisible: false,
  headerStyle: {
    backgroundColor: Colors.surfaceContainerLow,
    borderBottomWidth: 0,
    elevation: 0,
    shadowOpacity: 0,
  },
  headerTintColor: Colors.text,
  headerTitleStyle: {
    color: Colors.text,
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

/** Colour pre-selected when creating a list, tag or trackable. */
export const DEFAULT_ENTITY_COLOUR = "#4A90D9";
