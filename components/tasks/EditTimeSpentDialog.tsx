/**
 * Mobile counterpart of `DurationPickerDesktop` — the click-to-edit
 * time-spent control on web task rows.
 *
 * Behaves like the web popup: the duration presets are IMMEDIATELY
 * visible (no chevron step) and tapping one commits right away, while
 * the masked hh:mm input on top allows arbitrary values (committed via
 * Save). Empty input + Save clears the value to zero.
 */
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Text,
  TextInput,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  View,
} from "react-native";
import { Colors } from "../../constants/colors";
import { Button } from "../ui/Button";
import {
  DialogCard,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
} from "../ui/DialogScaffold";
import { TRACKABLE_DURATION_PRESETS } from "../../lib/trackableLogPresets";
import { applyDurationHhmmMask } from "../../lib/durationHhmmMask";
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

/** Fixed preset-row height so `getItemLayout` scroll offsets are exact. */
const ROW_HEIGHT = 44;

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
  const committedRef = useRef(false);

  const status = assessDurationHhMmInput(value, true);
  const isExplicitZero =
    /^\d{1,2}:\d{2}$/.test(value.trim()) && hhmmToSeconds(value) === 0;
  const canSave = status === "valid" || status === "empty" || isExplicitZero;

  // Web-popup parity: the full preset list is always visible (a compact
  // hh:mm value like "0:30" must not filter the list down to itself),
  // opened with the current value scrolled into view. Compare by seconds:
  // the field holds zero-padded "00:30" while presets read "0:30".
  const valueSeconds =
    status === "valid" ? hhmmToSeconds(value) : null;
  const selectedIndex = useMemo(
    () =>
      valueSeconds == null
        ? -1
        : TRACKABLE_DURATION_PRESETS.findIndex(
            (p) => hhmmToSeconds(p) === valueSeconds,
          ),
    [valueSeconds],
  );

  /**
   * Commit-and-close, like the web `DurationPickerDesktop`: the dialog
   * closes IMMEDIATELY and the mutation's optimistic update patches the
   * row behind it in the same frame. Never hold the dialog open on the
   * server round-trip — on a phone that round-trip can be slow, and if
   * it fails the optimistic value silently rolls back, which read as
   * "my edit didn't take" on device. Surface that failure loudly
   * instead.
   */
  const commitSeconds = (secs: number) => {
    if (committedRef.current) return;
    committedRef.current = true;
    onClose();
    void Promise.resolve(onSave(Math.max(0, Math.floor(secs)))).catch(
      (err) => {
        const message = "Time spent could not be saved. Please try again.";
        if (Platform.OS === "web") {
          if (typeof window !== "undefined") window.alert(message);
        } else {
          Alert.alert("Save failed", message);
        }
        console.warn("EditTimeSpentDialog save failed:", err);
      },
    );
  };

  const handleSave = () => {
    if (!canSave) return;
    commitSeconds(value.trim() ? hhmmToSeconds(value) : 0);
  };

  return (
    <DialogOverlay onBackdropPress={onClose} zIndex={2000}>
      <DialogCard desktopWidth={400}>
        <DialogHeader title="Time spent" onClose={onClose} />
        <Text style={styles.taskName} numberOfLines={2}>
          {taskName}
        </Text>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={(t) => setValue(applyDurationHhmmMask(t))}
          placeholder="hh:mm"
          placeholderTextColor={Colors.textTertiary}
          keyboardType="number-pad"
          autoCapitalize="none"
          accessibilityLabel="Time spent"
        />
        <View style={styles.listWrap}>
          <FlatList
            data={TRACKABLE_DURATION_PRESETS}
            keyExtractor={(item) => item}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            initialScrollIndex={selectedIndex > 0 ? selectedIndex : 0}
            getItemLayout={(_, index) => ({
              length: ROW_HEIGHT,
              offset: ROW_HEIGHT * index,
              index,
            })}
            renderItem={({ item, index }) => {
              const isActive = index === selectedIndex;
              return (
                <TouchableOpacity
                  style={[styles.row, isActive && styles.rowActive]}
                  // Option tap commits immediately — same as clicking a
                  // preset in the web dropdown.
                  onPress={() => commitSeconds(hhmmToSeconds(item))}
                >
                  <Text
                    style={[styles.rowText, isActive && styles.rowTextActive]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
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
  input: {
    backgroundColor: Colors.surfaceContainer,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.text,
  },
  listWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: Colors.surfaceContainer,
  },
  list: {
    maxHeight: ROW_HEIGHT * 5.5,
  },
  row: {
    height: ROW_HEIGHT,
    paddingHorizontal: 16,
    justifyContent: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.outlineVariant,
  },
  rowActive: { backgroundColor: Colors.primary + "18" },
  rowText: {
    fontSize: 14,
    color: Colors.text,
    fontVariant: ["tabular-nums"],
  },
  rowTextActive: { fontWeight: "700", color: Colors.primary },
});
