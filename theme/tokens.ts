/**
 * Design tokens — the only type sizes, corner radii, spacing steps and font
 * weights the app should use. Colours live in `constants/colors.ts`; card
 * surfaces in `theme/panels.ts`.
 *
 * Reach for a token instead of a raw number so that tuning the look of the
 * app is a one-file change. The time-grid calendar and the SVG charts are
 * the deliberate exceptions: their sizes are computed from layout maths.
 */

/** Type scale. */
export const FontSize = {
  /** Dense metadata only: chips inside a task row, axis ticks. */
  micro: 10,
  /** Secondary text, captions, helper and error copy. */
  caption: 12,
  /** Default body and control text. */
  body: 14,
  /** Inputs, primary buttons, emphasised rows. */
  bodyLarge: 16,
  /** Section and dialog titles. */
  title: 20,
  /** Page titles. */
  heading: 24,
  /** Hero numbers. */
  display: 32,
} as const;

/** Only three weights: regular copy, emphasis, titles. */
export const FontWeight = {
  regular: "400",
  semibold: "600",
  bold: "700",
} as const;

/** Corner radii. */
export const Radius = {
  /** Progress bars, small swatches, inline chips. */
  sm: 4,
  /** Controls: buttons, inputs, menus, rows. */
  md: 8,
  /** Cards and panels (`panelStyle`). */
  lg: 12,
  /** Dialogs and sheets. */
  xl: 16,
  /** Fully rounded: dots, avatars, FABs, pills. */
  pill: 999,
} as const;

/** Spacing steps for padding, margin and gap. */
export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
