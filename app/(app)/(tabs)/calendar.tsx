import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Colors } from "../../../constants/colors";
import { CalendarView } from "../../../components/shared/CalendarView";
import { EventDialog } from "../../../components/calendar/EventDialog";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { todayYYYYMMDD } from "../../../lib/dates";

export default function CalendarScreen() {
  const isDesktop = useIsDesktop();
  const [showEventDialog, setShowEventDialog] = useState(false);
  const [eventDay, setEventDay] = useState(todayYYYYMMDD());

  return (
    <View style={styles.container}>
      <CalendarView
        title={isDesktop ? "Calendar" : undefined}
        onAddEvent={(day) => {
          setEventDay(day);
          setShowEventDialog(true);
        }}
      />

      {showEventDialog && (
        <EventDialog
          day={eventDay}
          onClose={() => setShowEventDialog(false)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
});
