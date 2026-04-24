/**
 * Server-side colour composition for calendar events.
 *
 * Mirrors the relevant slice of `lib/eventColors.ts` (which is the pure
 * port of productivity-one's `colour.utils.ts` + factory rules), kept
 * separate here because the Convex bundler only consumes files under
 * `convex/`. The two copies of `DEFAULT_EVENT_COLOR` and
 * `deriveEventColors` MUST stay in sync — the colour the server picks
 * for a window is the colour the client renders, so any drift would
 * cause the dropped/persisted event to repaint to a different shade
 * than the live drag preview.
 *
 * Only composition lives here; contrast adjustment + readable-text
 * picking happen on the client at render time so the same display
 * colour can be re-evaluated against changing UI themes without
 * forcing a server query.
 */

export const DEFAULT_EVENT_COLOR = "#6b7280";

function isHex(s: string): boolean {
  return /^#[0-9a-fA-F]{3}$/.test(s) || /^#[0-9a-fA-F]{6}$/.test(s);
}

function safeHex(hex: string | undefined | null): string {
  if (typeof hex !== "string") return DEFAULT_EVENT_COLOR;
  const trimmed = hex.trim();
  return isHex(trimmed) ? trimmed : DEFAULT_EVENT_COLOR;
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

/**
 * Compose `displayColor` (background) + `secondaryColor` (left stripe)
 * from a trackable colour and a list colour.
 *
 * Mirrors `interactive-calendar-event-factory.service.ts:91-100`:
 *
 *   - displayColor = trackable ?? list ?? DEFAULT
 *   - secondaryColor = list, only when ALL hold:
 *       (a) trackable colour exists, AND
 *       (b) list colour exists and is NOT the default fallback, AND
 *       (c) the two colours differ
 *
 * The "list colour is not default" guard is what the original P1 factory
 * gets for free because `getListColorForTask` returns the default colour
 * when there's no list. We replicate the same effect by treating
 * undefined/empty list colour as "no list" (no stripe).
 */
export function deriveEventColors(
  trackableColor: string | undefined | null,
  listColor: string | undefined | null
): { displayColor: string; secondaryColor: string | undefined } {
  const t =
    trackableColor && trackableColor !== ""
      ? safeHex(trackableColor)
      : undefined;
  const l =
    listColor && listColor !== "" ? safeHex(listColor) : undefined;

  const displayColor = t ?? l ?? DEFAULT_EVENT_COLOR;
  const listIsDefaultFallback =
    !!l && normalizeHexKey(l) === normalizeHexKey(DEFAULT_EVENT_COLOR);
  const secondaryColor =
    t && l && !listIsDefaultFallback && normalizeHexKey(t) !== normalizeHexKey(l)
      ? l
      : undefined;
  return { displayColor, secondaryColor };
}
