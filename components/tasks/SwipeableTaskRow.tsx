import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from "react-native-gesture-handler/ReanimatedSwipeable";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";

const DELETE_ACTION_WIDTH = 88;

interface SwipeableTaskRowProps {
  onDelete: () => void;
  children: React.ReactNode;
  /**
   * When false, renders children with no swipe behaviour. Used on desktop
   * web (where the row uses right-click context menu instead) and for
   * non-deletable rows (empty-day placeholders, group headers).
   */
  enabled?: boolean;
}

/**
 * Wraps a task row in a horizontal swipeable panel. Swipe LEFT reveals
 * a red "Delete" action on the trailing edge — the iOS Mail /
 * Reminders / Todoist / Google Tasks pattern.
 *
 * Coexists with:
 *   • Tap (opens `TaskDetailSheet`) — swipeable only starts stealing the
 *     gesture after `dragOffsetFromRightEdge` px of horizontal travel, so
 *     a plain tap on the row still fires normally.
 *   • Long-press drag from `NestableDraggableFlatList` (row reorder) —
 *     drag activation is vertical; horizontal swipe doesn't compete.
 */
export function SwipeableTaskRow({
  onDelete,
  children,
  enabled = true,
}: SwipeableTaskRowProps) {
  if (!enabled) return <>{children}</>;

  const renderRightActions = (
    _progress: unknown,
    _translation: unknown,
    swipeableMethods: SwipeableMethods,
  ) => (
    <View style={styles.actionContainer}>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => {
          swipeableMethods.close();
          onDelete();
        }}
        accessibilityRole="button"
        accessibilityLabel="Delete task"
      >
        <Ionicons name="trash-outline" size={20} color={Colors.white} />
        <Text style={styles.deleteText}>Delete</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      // Reveal the action once the row is dragged more than half the
      // action width; below that, releasing snaps back closed.
      rightThreshold={DELETE_ACTION_WIDTH * 0.5}
      // Require ~20px of horizontal travel before the swipe activates so
      // taps and vertical scrolls aren't mistaken for a swipe.
      dragOffsetFromRightEdge={20}
      overshootRight={false}
      friction={1.8}
      containerStyle={styles.container}
    >
      {children}
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: "hidden",
  },
  actionContainer: {
    width: DELETE_ACTION_WIDTH,
    justifyContent: "center",
    // Match the vertical breathing room of `TaskList.styles.taskCard`
    // (marginBottom: 8) so the red action doesn't crash into the next row.
    paddingBottom: 8,
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: Colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginLeft: 8,
    gap: 2,
  },
  deleteText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: "600",
  },
});
