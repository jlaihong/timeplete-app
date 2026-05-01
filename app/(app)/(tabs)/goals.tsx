import React from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Colors } from "../../../constants/colors";
import { TrackableList } from "../../../components/shared/TrackableList";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { GoalsJournalSidebar } from "../../../components/trackables/GoalsJournalSidebar";

/**
 * Mirrors productivity-one `App.tsx`: padded workspace (`2rem`) and Bootstrap
 * `lg` split (~col-lg-8 / ~col-lg-4): Tasks-blue Trackables rail vs magenta Journal rail — no calendar.
 */
const LG_BREAKPOINT = 992;
const PAGE_PADDING = 32;

export default function GoalsScreen() {
  const isDesktop = useIsDesktop();
  const { width } = useWindowDimensions();

  const splitIntoColumns = isDesktop && width >= LG_BREAKPOINT;
  /** Tablet-ish desktop: stack rails vertically like Bootstrap collapsed cols */
  const showJournalRail = isDesktop;

  const trackablesPane = (
    <View
      style={[
        styles.flex,
        showJournalRail ? styles.trackablesInRail : styles.flex,
      ]}
    >
      <TrackableList variant="productivity-one-goals" title="Trackables" />
    </View>
  );

  if (!showJournalRail) {
    return (
      <View style={styles.container}>
        {trackablesPane}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.shell,
          splitIntoColumns ? styles.shellRow : styles.shellColumn,
        ]}
      >
        <View style={splitIntoColumns ? styles.colWide : styles.railFull}>
          {trackablesPane}
        </View>
        <View
          style={
            splitIntoColumns
              ? styles.colNarrow
              : [styles.railFull, styles.journalStack]
          }
        >
          <GoalsJournalSidebar />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1, minHeight: 0 },
  trackablesInRail: { minWidth: 0 },
  shell: {
    flex: 1,
    padding: PAGE_PADDING,
    gap: 8,
    minHeight: 0,
  },
  shellRow: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  shellColumn: {
    flexDirection: "column",
  },
  colWide: { flex: 8, minWidth: 0, minHeight: 0 },
  colNarrow: { flex: 4, minWidth: 0, minHeight: 0 },
  railFull: { minHeight: 0 },
  journalStack: {
    flexGrow: 0,
    minHeight: 200,
    maxHeight: 360,
  },
});
