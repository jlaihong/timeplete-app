import { TRACKABLE_DURATION_PRESETS } from "../../../../lib/trackableLogPresets";

export interface DurationComboFieldProps {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
  /** Tracker dialog: allow empty duration (“None”). */
  allowNone: boolean;
}

export interface DurationComboOption {
  value: string;
  label: string;
}

/**
 * Presets for autocomplete (same filter behavior as `DurationPickerDesktop`).
 * When `allowNone`, inserts a “None” row when the query is empty or typed
 * `n`/`no`… so users can pick no duration without a separate control.
 */
export function filterDurationComboOptions(
  query: string,
  allowNone: boolean
): DurationComboOption[] {
  const q = query.trim().toLowerCase();

  let presets: string[];
  if (!q) {
    presets = [...TRACKABLE_DURATION_PRESETS];
  } else {
    const matches = TRACKABLE_DURATION_PRESETS.filter((o) =>
      o.toLowerCase().includes(q)
    );
    presets = matches.length > 0 ? matches : [...TRACKABLE_DURATION_PRESETS];
  }

  const rows: DurationComboOption[] = presets.map((v) => ({
    value: v,
    label: v,
  }));

  if (allowNone && (!q || "none".startsWith(q))) {
    return [{ value: "", label: "None" }, ...rows];
  }

  return rows;
}
