/** Human-readable labels for `timeWindows.source` in edit-dialog history. */
export function labelForEditDialogTimeSource(key: string): string {
  switch (key) {
    case "timer":
      return "Timer";
    case "manual":
      return "Manual time";
    case "calendar":
      return "Calendar";
    case "tracker_entry":
      return "Tracked entry";
    default:
      return key;
  }
}
