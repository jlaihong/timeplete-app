import React from "react";
import { View, StyleSheet, useWindowDimensions } from "react-native";
import { Colors } from "../../../constants/colors";
import { TrackableList } from "../../../components/shared/TrackableList";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { useRegisterDesktopSubtitle } from "../../../components/layout/DesktopAppChrome";

const PAGE_PADDING = 24;

/**
 * Trackables tab — layout mirrors productivity-one `goals-page.html`:
 * centered content column (~xl:w-4/5), page title + add, "Current" / "Archived"
 * sections with dividers and a responsive multi-column grid (not the home
 * Journal split from `App.tsx`).
 */
export default function GoalsScreen() {
  const isDesktop = useIsDesktop();
  const { width } = useWindowDimensions();
  useRegisterDesktopSubtitle("Trackables");

  const contentMaxWidth =
    isDesktop && width >= 900
      ? Math.min(1200, width * 0.8)
      : Math.min(1200, width);

  return (
    <View style={styles.container}>
      <View style={[styles.shell, { maxWidth: contentMaxWidth }]}>
        <TrackableList
          variant="trackables-page"
          title="Trackables"
          showArchivedToggle={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  shell: {
    flex: 1,
    width: "100%",
    padding: PAGE_PADDING,
    minHeight: 0,
  },
});
