import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import {
  CalendarView,
  type AddEventPrefill,
  type EditEventPayload,
} from "../../../components/shared/CalendarView";
import { EventDialog } from "../../../components/calendar/EventDialog";
import { useIsDesktop } from "../../../hooks/useIsDesktop";

/**
 * Single dialog state — there is one EventDialog instance reused for
 * both create and edit. The `mode` discriminates how it's mounted:
 *
 *  - { mode: "create", day, prefill? } → blank form (or pre-filled from
 *    a calendar drag gesture).
 *  - { mode: "edit", day, event }      → form hydrated from an existing
 *    time window so the user can update it in place.
 */
type DialogState =
  | { mode: "create"; day: string; prefill: AddEventPrefill | null }
  | { mode: "edit"; day: string; event: EditEventPayload }
  | null;

export default function CalendarScreen() {
  const isDesktop = useIsDesktop();
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <View style={styles.container}>
      <CalendarView
        title={isDesktop ? "Calendar" : undefined}
        onAddEvent={(day, prefill) => {
          setDialog({ mode: "create", day, prefill: prefill ?? null });
        }}
        onEditEvent={(event) => {
          setDialog({
            mode: "edit",
            day: event.startDayYYYYMMDD,
            event,
          });
        }}
      />

      {dialog && (
        <EventDialog
          day={dialog.day}
          existingEvent={dialog.mode === "edit" ? dialog.event : undefined}
          defaultStartTimeHHMM={
            dialog.mode === "create" ? dialog.prefill?.startTimeHHMM : undefined
          }
          defaultDurationMinutes={
            dialog.mode === "create"
              ? dialog.prefill?.durationMinutes
              : undefined
          }
          onClose={() => setDialog(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
