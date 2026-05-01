/**
 * Digit masking for HH:MM duration entry — shared by `DurationPickerDesktop`
 * and trackable log dialogs (productivity-one `duration-picker-mask.directive`).
 */

/** Strip non-digits. */
export function unmaskDurationDigits(value: string): string {
  return value.replace(/[^\d]/g, "");
}

/**
 * Insert a colon two characters from the right once we have at least 3 digits.
 * Examples: "130" → "1:30", "1230" → "12:30", "5" → "5", "" → "".
 */
export function applyDurationHhmmMask(value: string): string {
  const digits = unmaskDurationDigits(value).slice(0, 5);
  if (digits.length >= 3) {
    return digits.slice(0, digits.length - 2) + ":" + digits.slice(-2);
  }
  return digits;
}
