import { FontSize, Radius } from "../../theme/tokens";
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
  /**
   * When given, swiping RIGHT reveals a "Done" (or "Undo") action on the
   * leading edge that toggles the task's completion.
   */
  onToggleComplete?: () => void;
  /** Whether the task is already complete; switches the label to "Undo". */
  completed?: boolean;
  children: React.ReactNode;
  /**
   * When false, renders children with no swipe behaviour. Used on desktop
   * web (where the row uses right-click context menu instead) and for
   * non-deletable rows (empty-day placeholders, group headers).
   */
  enabled?: boolean;
}

/**
 * Wraps a task row in a horizontal swipeable panel. Swipe RIGHT reveals a
 * green "Done" action on the leading edge; swipe LEFT reveals
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
  onToggleComplete,
  completed = false,
  children,
  enabled = true,
}: SwipeableTaskRowProps) {
  if (!enabled) return <>{children}</>;

  const renderLeftActions = (
    _progress: unknown,
    _translation: unknown,
    swipeableMethods: SwipeableMethods,
  ) => (
    <View style={styles.actionContainer}>
      <TouchableOpacity
        style={styles.completeBtn}
        onPress={() => {
          swipeableMethods.close();
          onToggleComplete?.();
        }}
        accessibilityRole="button"
        accessibilityLabel={completed ? "Mark incomplete" : "Mark complete"}
      >
        <Ionicons
          name={completed ? "arrow-undo-outline" : "checkmark"}
          size={20}
          color={Colors.onPrimary}
        />
        <Text style={styles.completeText}>{completed ? "Undo" : "Done"}</Text>
      </TouchableOpacity>
    </View>
  );

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
      renderLeftActions={onToggleComplete ? renderLeftActions : undefined}
      leftThreshold={DELETE_ACTION_WIDTH * 0.5}
      dragOffsetFromLeftEdge={20}
      overshootLeft={false}
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
  },
  deleteBtn: {
    flex: 1,
    backgroundColor: Colors.errorContainer,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
    gap: 2,
  },
  completeBtn: {
    flex: 1,
    backgroundColor: Colors.success,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    gap: 2,
  },
  completeText: {
    color: Colors.onPrimary,
    fontSize: FontSize.caption,
    fontWeight: "600",
  },
  deleteText: {
    color: Colors.white,
    fontSize: FontSize.caption,
    fontWeight: "600",
  },
});
