/**
 * Presets for trackable “Add progress” time entry — shared by
 * `DurationPickerDesktop` (task rows) and trackable log dialogs so duration
 * choices stay identical to productivity-one’s `app-duration-picker` list.
 */
export const TRACKABLE_DURATION_PRESETS: string[] = [
  "0:05",
  "0:10",
  "0:15",
  "0:20",
  "0:25",
  "0:30",
  "0:45",
  "1:00",
  "1:15",
  "1:30",
  "1:45",
  "2:00",
  "2:30",
  "3:00",
  "4:00",
  "5:00",
  "6:00",
  "7:00",
  "8:00",
];

/** Quarter-hour times 00:00 … 23:45 — same grid as productivity-one time pickers. */
export function quarterHourStartTimeOptions(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      out.push(
        `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
      );
    }
  }
  return out;
}

/**
 * Default start time snapped to the previous 15-minute mark (matches
 * productivity-one’s quarter-hour grid).
 */
export function defaultStartTimeQuarterHour(): string {
  const d = new Date();
  const minutes = Math.floor(d.getMinutes() / 15) * 15;
  return `${String(d.getHours()).padStart(2, "0")}:${String(minutes).padStart(
    2,
    "0"
  )}`;
}
