/**
 * Calendar-event colour utilities.
 *
 * Direct port of productivity-one's `src/app/utils/colour.utils.ts` so the
 * Timeplete calendar can match P1 pixel-for-pixel:
 *
 *   - `DEFAULT_EVENT_COLOR` is the same `#6b7280` (gray-500) P1 falls back
 *     to in `interactive-calendar.ts:106` when an event has neither a
 *     trackable nor a list colour.
 *
 *   - `MIN_EVENT_TEXT_CONTRAST = 4.5` is the WCAG AA threshold P1 enforces
 *     on every event tile (calendar event text is ~0.85em, so we need full
 *     normal-text contrast, not large-text contrast).
 *
 *   - `pickReadableTextColor(bg)` chooses between pure black and pure
 *     white using sRGB relative luminance + WCAG contrast ratio, identical
 *     to P1.
 *
 *   - `ensureMinContrastBg(bg, fg, ratio)` nudges the background toward
 *     the opposite of `fg` (binary search, 18 iterations) until the
 *     contrast clears the threshold. This is what lets bright user-picked
 *     trackable colours stay visually similar while still being readable.
 *
 *   - `makeReadableColourPair` is the public entry point — returns
 *     `{ bg, fg, textShadow }` for a given trackable/list colour.
 *
 * Pure module — no React, no DOM, no Convex deps. Safe to import from
 * components, queries, and tests.
 */

export const DEFAULT_EVENT_COLOR = "#6b7280";
export const MIN_EVENT_TEXT_CONTRAST = 4.5;

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB {
  const h = hex.replace("#", "").trim();
  const full =
    h.length === 3
      ? h
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }: RGB): string {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function relativeLuminance({ r, g, b }: RGB): number {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function contrastRatio(L1: number, L2: number): number {
  const lighter = Math.max(L1, L2);
  const darker = Math.min(L1, L2);
  return (lighter + 0.05) / (darker + 0.05);
}

function mixRgb(a: RGB, b: RGB, t: number): RGB {
  const tt = Math.min(1, Math.max(0, t));
  return {
    r: Math.round(a.r + (b.r - a.r) * tt),
    g: Math.round(a.g + (b.g - a.g) * tt),
    b: Math.round(a.b + (b.b - a.b) * tt),
  };
}

/** Validate a hex string; returns the input if valid, else the default. */
export function safeHex(hex: string | undefined | null): string {
  if (typeof hex !== "string") return DEFAULT_EVENT_COLOR;
  const trimmed = hex.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(trimmed) || /^#[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed;
  }
  return DEFAULT_EVENT_COLOR;
}

function normalizeHexKey(hex: string): string {
  const safe = safeHex(hex);
  const h = safe.slice(1);
  if (h.length === 3) {
    return `#${h
      .split("")
      .map((c) => c + c)
      .join("")
      .toLowerCase()}`;
  }
  return `#${h.toLowerCase()}`;
}

export function pickReadableTextColor(bgHex: string): "#000000" | "#FFFFFF" {
  const bg = hexToRgb(safeHex(bgHex));
  const Lbg = relativeLuminance(bg);
  const cWhite = contrastRatio(Lbg, 1);
  const cBlack = contrastRatio(Lbg, 0);
  return cWhite >= cBlack ? "#FFFFFF" : "#000000";
}

/**
 * Nudge `bgHex` toward black/white (whichever is *opposite* `textColor`)
 * until contrast >= `minRatio`. Returns the original bg if it already
 * meets the threshold.
 */
export function ensureMinContrastBg(
  bgHex: string,
  textColor: "#000000" | "#FFFFFF",
  minRatio: number
): string {
  const safe = safeHex(bgHex);
  const bg = hexToRgb(safe);
  const Ltext = textColor === "#FFFFFF" ? 1 : 0;
  const current = contrastRatio(relativeLuminance(bg), Ltext);
  if (current >= minRatio) return safe;

  const target: RGB =
    textColor === "#FFFFFF"
      ? { r: 0, g: 0, b: 0 }
      : { r: 255, g: 255, b: 255 };

  let lo = 0;
  let hi = 1;
  let best: RGB | null = null;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const candidate = mixRgb(bg, target, mid);
    const ratio = contrastRatio(relativeLuminance(candidate), Ltext);
    if (ratio >= minRatio) {
      best = candidate;
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return rgbToHex(best ?? target);
}

export interface ReadableColourPair {
  /** Background hex (potentially adjusted to meet contrast). */
  bg: string;
  /** Foreground (text) hex — pure black or white. */
  fg: "#000000" | "#FFFFFF";
  /** CSS text-shadow string, opposite the fg for extra edge contrast. */
  textShadow: string;
}

export function makeReadableColourPair(
  bgHex: string,
  minRatio: number = MIN_EVENT_TEXT_CONTRAST
): ReadableColourPair {
  const fg = pickReadableTextColor(bgHex);
  const bg = ensureMinContrastBg(bgHex, fg, minRatio);
  const textShadow =
    fg === "#FFFFFF"
      ? "0 0.5px 0.5px rgba(0,0,0,0.35)"
      : "0 0.5px 0.5px rgba(255,255,255,0.35)";
  return { bg, fg, textShadow };
}

/**
 * Compose `displayColor` (background) + `secondaryColor` (left stripe)
 * from a trackable colour and a list colour, mirroring
 * `interactive-calendar-event-factory.service.ts:91-100` exactly.
 *
 *   - `displayColor` = trackable ?? list ?? DEFAULT
 *   - `secondaryColor` is the LIST colour, only when:
 *       (a) trackable colour exists, AND
 *       (b) list colour exists and is NOT the default fallback, AND
 *       (c) the two colours are different
 *     This is the dual-colour case (trackable fill + list edge stripe).
 *     Single-colour events have no stripe.
 */
export function deriveEventColors(
  trackableColor: string | undefined | null,
  listColor: string | undefined | null
): { displayColor: string; secondaryColor: string | undefined } {
  const t = trackableColor && trackableColor !== "" ? safeHex(trackableColor) : undefined;
  const l = listColor && listColor !== "" ? safeHex(listColor) : undefined;

  const displayColor = t ?? l ?? DEFAULT_EVENT_COLOR;
  const listIsDefaultFallback =
    !!l && normalizeHexKey(l) === normalizeHexKey(DEFAULT_EVENT_COLOR);
  const secondaryColor =
    t && l && !listIsDefaultFallback && normalizeHexKey(t) !== normalizeHexKey(l)
      ? l
      : undefined;
  return { displayColor, secondaryColor };
}
