import React, { useEffect, useState } from "react";
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from "react-native";
import { Colors } from "../../../constants/colors";
import { TrackableList } from "../../../components/shared/TrackableList";
import { EditTrackableDialog } from "../../../components/trackables/EditTrackableDialog";
import { useIsDesktop } from "../../../hooks/useIsDesktop";
import { traceScreenMount } from "../../../lib/navInstrumentation";
import { Id } from "../../../convex/_generated/dataModel";

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
  const [heavyReady, setHeavyReady] = useState(false);
  // Own the edit dialog at the page root — same pattern as `DesktopHome`.
  // Falling back to `router.push('/edit-trackable/[id]')` renders the dialog
  // as a sibling Drawer.Screen; on desktop's permanent drawer, `router.back()`
  // from that screen doesn't reliably pop the transition, so X/Cancel appear
  // dead. Owning the dialog here keeps the close callback a plain
  // `setState(null)` — identical to the home page flow that already works.
  const [editingTrackableId, setEditingTrackableId] =
    useState<Id<"trackables"> | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setHeavyReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (heavyReady) traceScreenMount("(tabs)/goals TrackableList");
  }, [heavyReady]);

  const contentMaxWidth =
    isDesktop && width >= 900
      ? Math.min(1200, width * 0.8)
      : Math.min(1200, width);

  return (
    <View style={styles.container}>
      <View style={[styles.shell, { maxWidth: contentMaxWidth }]}>
        {!heavyReady ? (
          <View
            style={styles.pending}
            accessibilityLabel="Loading trackables"
          >
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <TrackableList
            variant="trackables-page"
            title="Trackables"
            showArchivedToggle={false}
            onRequestEditTrackable={(id) =>
              setEditingTrackableId(id as Id<"trackables">)
            }
          />
        )}
      </View>

      {editingTrackableId && (
        <EditTrackableDialog
          trackableId={editingTrackableId}
          onClose={() => setEditingTrackableId(null)}
        />
      )}
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
  pending: {
    flex: 1,
    minHeight: 200,
    alignItems: "center",
    justifyContent: "center",
  },
});
