import { quarterHourStartTimeOptions } from "../../../../lib/trackableLogPresets";

export interface StartTimeComboFieldProps {
  label: string;
  value: string;
  onChange: (hhmm: string) => void;
}

export const ALL_START_PRESETS = quarterHourStartTimeOptions();

export function filterStartPresets(query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_START_PRESETS;
  const matches = ALL_START_PRESETS.filter((o) => o.toLowerCase().includes(q));
  return matches.length > 0 ? matches : ALL_START_PRESETS;
}
