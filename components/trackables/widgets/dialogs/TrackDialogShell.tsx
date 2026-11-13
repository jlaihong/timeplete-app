/**
 * Shared chrome for the four Track* logging dialogs (tracker / time /
 * periodic / count).
 *
 * `DialogOverlay` supplies the backdrop, ESC-to-close (web), mobile-web
 * visual-viewport sizing, and — on native — the keyboard shift that lifts
 * the card above the soft keyboard (see `useDialogKeyboardShift`).
 *
 * The action buttons render OUTSIDE the scroll region as a fixed footer:
 * with the card height-capped while the keyboard is up, the scroll body
 * (`flexShrink: 1`) gives up height and Cancel/Save stay visible instead
 * of being pushed behind the keyboard.
 */
import React, { useContext, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../../../constants/colors";
import { FontSize, Radius } from "../../../../theme/tokens";
import { DateField } from "../../../ui/DateField";
import {
  addDays,
  formatYYYYMMDDtoDDMMM,
  todayYYYYMMDD,
} from "../../../../lib/dates";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Card } from "../../../ui/Card";
import {
  DialogOverlay,
  DialogHeader,
  DialogFooter,
  dialogSurfaceStyle,
} from "../../../ui/DialogScaffold";
import { DialogMaxHeightContext } from "../../../ui/useDialogKeyboardShift";

interface TrackDialogShellProps {
  onClose: () => void;
  /** The trackable being logged against, and its colour. */
  title: string;
  colour?: string;
  /** What is being logged, e.g. "Log time". */
  subtitle?: string;
  /** Card width cap — mirrors each dialog's previous `dialogWrap` width. */
  maxWidth?: number;
  /**
   * The value being logged (a stepper, a rating, a duration…). It comes
   * first and is the only thing shown at full size: the day and the note
   * are the same in every log dialog, so the shell draws them underneath.
   */
  children: React.ReactNode;
  /** The entry's day, YYYYMMDD. Shown as a chip; press it to change. */
  day: string;
  onDayChange: (day: string) => void;
  /** Optional note. Hidden behind "Add note" until there is one. */
  note: string;
  onNoteChange: (note: string) => void;
  notePlaceholder?: string;
  /** Fixed footer content (Cancel / Save buttons). */
  actions: React.ReactNode;
}

export function TrackDialogShell({
  onClose,
  title,
  colour,
  subtitle,
  maxWidth = 440,
  children,
  actions,
  day,
  onDayChange,
  note,
  onNoteChange,
  notePlaceholder = "Add a note",
}: TrackDialogShellProps) {
  // Almost every entry is for today with no note, so both start folded.
  const [dateOpen, setDateOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(() => note.trim() !== "");
  return (
    <DialogOverlay onBackdropPress={onClose} align="center">
      <ShellCard maxWidth={maxWidth}>
        <DialogHeader
          title={title}
          colour={colour}
          subtitle={subtitle}
          onClose={onClose}
        />
        <KeyboardAwareScrollView
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          bottomOffset={100}
          // Hide the vertical scrollbar so it doesn't overlap inputs
          // below (RN draws the indicator inside the viewport).
          showsVerticalScrollIndicator={false}
        >
          {children}

          <View style={styles.metaRow}>
            <Pressable
              onPress={() => setDateOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityLabel={`Date: ${dayChipLabel(day)}. Change`}
              accessibilityState={{ expanded: dateOpen }}
              style={(state) => [
                styles.metaChip,
                ((state as { hovered?: boolean }).hovered || state.pressed) &&
                  styles.metaChipHover,
              ]}
            >
              <Ionicons
                name="calendar-outline"
                size={14}
                color={Colors.textSecondary}
              />
              <Text style={styles.metaChipText}>{dayChipLabel(day)}</Text>
            </Pressable>
            {!noteOpen ? (
              <Pressable
                onPress={() => setNoteOpen(true)}
                accessibilityRole="button"
                style={(state) => [
                  styles.metaChip,
                  ((state as { hovered?: boolean }).hovered ||
                    state.pressed) &&
                    styles.metaChipHover,
                ]}
              >
                <Ionicons
                  name="create-outline"
                  size={14}
                  color={Colors.textSecondary}
                />
                <Text style={styles.metaChipText}>Add note</Text>
              </Pressable>
            ) : null}
          </View>

          {dateOpen ? (
            <View style={styles.metaField}>
              <DateField label="Date" value={day} onChange={onDayChange} />
            </View>
          ) : null}
          {noteOpen ? (
            <TextInput
              style={styles.noteInput}
              value={note}
              onChangeText={(t) => onNoteChange(t.slice(0, 1024))}
              placeholder={notePlaceholder}
              placeholderTextColor={Colors.textTertiary}
              accessibilityLabel="Note"
              multiline
              autoFocus={note.trim() === ""}
            />
          ) : null}
        </KeyboardAwareScrollView>
        <DialogFooter>{actions}</DialogFooter>
      </ShellCard>
    </DialogOverlay>
  );
}

/** "Today", "Yesterday", or the date. */
function dayChipLabel(dayYYYYMMDD: string): string {
  const today = todayYYYYMMDD();
  if (dayYYYYMMDD === today) return "Today";
  if (dayYYYYMMDD === addDays(today, -1)) return "Yesterday";
  return formatYYYYMMDDtoDDMMM(dayYYYYMMDD);
}

/**
 * Rendered inside `DialogOverlay` so it can read `DialogMaxHeightContext`
 * — the overlay's keyboard-aware pixel height cap on native (percentages
 * can't resolve against the overlay's content-sized anchor wrappers).
 */
function ShellCard({
  maxWidth,
  children,
}: {
  maxWidth: number;
  children: React.ReactNode;
}) {
  const keyboardMax = useContext(DialogMaxHeightContext);
  return (
    <Card
      style={[
        styles.dialog,
        { maxWidth },
        keyboardMax != null ? { maxHeight: keyboardMax } : null,
      ]}
    >
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  dialog: {
    ...dialogSurfaceStyle,
    // 92% (not 100%) keeps the old overlay-padding side insets on phones.
    width: "92%",
    alignSelf: "center",
    // Clip overflowing content to the rounded card (parity with DialogCard).
    overflow: "hidden",
    ...Platform.select({
      web: { maxHeight: "85%" } as object,
      default: {},
    }),
  },
  // `flexShrink: 1` (RN default 0) lets the body give up height when the
  // card is height-capped (keyboard open); content beyond that scrolls.
  scroll: { flexGrow: 0, flexShrink: 1 },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    // The value block above brings its own bottom margin.
    marginTop: 4,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 32,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  metaChipHover: { backgroundColor: Colors.surfaceContainerHighest },
  metaChipText: { fontSize: FontSize.caption, color: Colors.text },
  metaField: { marginTop: 12 },
  noteInput: {
    marginTop: 12,
    minHeight: 72,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Colors.surfaceContainer,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
    color: Colors.text,
    fontSize: FontSize.body,
    textAlignVertical: "top",
  },
});
