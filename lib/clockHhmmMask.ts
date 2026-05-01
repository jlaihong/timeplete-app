/**
 * Digit masking for 24-hour clock HH:MM (same colon rule as duration:
 * at least 3 digits → insert colon before last two). Max 4 digits → HHMM.
 */
export function applyClockHhmmMask(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return digits.slice(0, digits.length - 2) + ":" + digits.slice(-2);
}
