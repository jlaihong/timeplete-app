/**
 * Mobile counterpart of `DurationPickerDesktop` — the click-to-edit
 * time-spent control on web task rows.
 *
 * Desktop edits inline (input swaps in place, portal dropdown of the
 * duration presets). There is no touch equivalent of an inline swap
 * inside a compact row, so on mobile the SAME edit — masked hh:mm entry
 * plus the same `TRACKABLE_DURATION_PRESETS` list — opens in a small
 * dialog using the app-standard `DurationComboField` (text field +
 * chevron → preset picker).
 */
import React, { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import { DurationComboField } from "../trackables/widgets/dialogs/DurationComboField";
import {
  assessDurationHhMmInput,
  hhmmToSeconds,
  secondsToDurationString,
} from "../../lib/dates";

interface EditTimeSpentDialogProps {
  taskName: string;
  initialSeconds: number;
  onClose: () => void;
  /** Persist the new absolute time-spent value (in seconds). */
  onSave: (newSeconds: number) => Promise<void> | void;
}

export function EditTimeSpentDialog({
  taskName,
  initialSeconds,
  onClose,
  onSave,
}: EditTimeSpentDialogProps) {
  // Zero is represented as EMPTY, not "00:00": `assessDurationHhMmInput`
  // rejects zero durations, so prefilled "00:00" on a 0m task would show
  // a validation error before the user touched anything. Empty (with
  // `allowNone`) reads as "no time logged" and saves as 0 — which also
  // gives users a way to clear a previously logged value.
  const [value, setValue] = useState(() => {
    const secs = Math.max(0, Math.floor(initialSeconds));
    return secs > 0 ? secondsToDurationString(secs) : "";
  });
  const [saving, setSaving] = useState(false);

  const status = assessDurationHhMmInput(value, true);
  const isExplicitZero =
    /^\d{1,2}:\d{2}$/.test(value.trim()) && hhmmToSeconds(value) === 0;
  const canSave = status === "valid" || status === "empty" || isExplicitZero;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const secs = value.trim() ? hhmmToSeconds(value) : 0;
      await onSave(Math.max(0, Math.floor(secs)));
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogOverlay onBackdropPress={onClose} zIndex={2000}>
      <DialogCard desktopWidth={400}>
        <DialogHeader title="Time spent" onClose={onClose} />
        <Text style={styles.taskName} numberOfLines={2}>
          {taskName}
        </Text>
        <DurationComboField
          label="Time spent"
          value={value}
          onChange={setValue}
          allowNone
        />
        <DialogFooter>
          <Button
            title="Cancel"
            variant="ghost"
            onPress={onClose}
            size="small"
          />
          <Button
            title="Save"
            onPress={handleSave}
            loading={saving}
            disabled={!canSave}
            size="small"
          />
        </DialogFooter>
      </DialogCard>
    </DialogOverlay>
  );
}

const styles = StyleSheet.create({
  taskName: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginBottom: 12,
  },
});
