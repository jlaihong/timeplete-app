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
import { HomeDndProvider } from "../../../components/dnd/HomeDndProvider";
import {
  CalendarModeSwitch,
  CalendarMonthView,
  CalendarWeekView,
  type CalendarMode,
} from "../../../components/calendar/CalendarRangeViews";
import { todayYYYYMMDD } from "../../../lib/dates";

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
  // One day is shared by all three views: it is the day shown, or the
  // day whose week or month is shown, so switching views stays in place.
  const [mode, setMode] = useState<CalendarMode>("day");
  const [day, setDay] = useState(todayYYYYMMDD());
  const addEvent = (onDay: string, prefill?: AddEventPrefill) =>
    setDialog({ mode: "create", day: onDay, prefill: prefill ?? null });
  const editEvent = (event: EditEventPayload) =>
    setDialog({ mode: "edit", day: event.startDayYYYYMMDD, event });
  const rangeProps = {
    anchorDay: day,
    onAnchorDayChange: setDay,
    onOpenDay: (d: string) => {
      setDay(d);
      setMode("day");
    },
    onAddEvent: addEvent,
    onEditEvent: editEvent,
  };

  return (
    <HomeDndProvider>
      <View style={styles.container}>
        <CalendarModeSwitch mode={mode} onChange={setMode} />
        {mode === "day" ? (
          <CalendarView
            title={isDesktop ? "Calendar" : undefined}
            day={day}
            onSelectedDayChange={setDay}
            onAddEvent={addEvent}
            onEditEvent={editEvent}
          />
        ) : mode === "week" ? (
          <CalendarWeekView {...rangeProps} />
        ) : (
          <CalendarMonthView {...rangeProps} />
        )}

        {dialog && (
          <EventDialog
            day={dialog.day}
            existingEvent={dialog.mode === "edit" ? dialog.event : undefined}
            defaultStartTimeHHMM={
              dialog.mode === "create"
                ? dialog.prefill?.startTimeHHMM
                : undefined
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
    </HomeDndProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
