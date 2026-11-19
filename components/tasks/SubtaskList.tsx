/**
 * A task's subtasks: tick, rename, time, reorder, add, delete.
 *
 * Shown inline under a task row (Home, list pages) and inside the task
 * detail sheet. Self-contained: it loads its own rows and owns its
 * mutations, so a host only has to mount it with the task's id.
 *
 * Reordering is a drag on the row's grip and stays inside this list;
 * there is no drop target outside it, so a subtask cannot leave its task.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Colors } from "../../constants/colors";
import { FontSize, Radius } from "../../theme/tokens";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useSubtasks } from "../../hooks/useSubtasks";
import {
  consumeSubtaskAddFocus,
  toggleSubtasksExpanded,
  useSubtasksExpanded,
} from "../../lib/subtaskExpansion";
import { formatSecondsAsHM } from "../../lib/dates";
import { CompleteCheckIcon } from "./CompleteCheckIcon";
import { DurationPickerDesktop } from "./DurationPickerDesktop";
import { EditTimeSpentDialog } from "./EditTimeSpentDialog";
import { LiveElapsedText } from "../timer/LiveElapsedText";
import { MentionText } from "../mentions/MentionText";
import { plainMentions } from "../../lib/mentions";

const isWeb = Platform.OS === "web";
/**
 * True with a mouse or trackpad. There the grip, play and time controls
 * stay out of the way until a row is hovered; a touch screen has no
 * hover, so they are always shown.
 */
const canHover =
  isWeb &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover)").matches;
/** Every row is this tall, which is what lets a drag map to a position. */
const ROW_HEIGHT = 36;

function formatTicking(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0)
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Keeps pointer and key events inside the subtask area. Task rows on the
 * web are dnd-kit drag sources and open the detail sheet on click; a
 * press, drag or keystroke on a subtask must not reach them.
 */
function Isolate({ children }: { children: React.ReactNode }) {
  if (!isWeb) return <>{children}</>;
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      onPointerDown={stop}
      onTouchStart={stop}
      onMouseDown={stop}
      onClick={stop}
      onKeyDown={stop}
      onContextMenu={stop}
      style={{ cursor: "default", width: "100%" }}
    >
      {children}
    </div>
  );
}

/**
 * "2/5" on a task row; press to show or hide the task's subtasks.
 *
 * None of the controls in this file take `accessibilityRole="button"`: on
 * the web a task row is itself rendered as a `<button>` (the drag source),
 * and a `<button>` may not contain another. They are labelled instead.
 */
export function SubtaskChip({
  taskId,
  count,
  completedCount,
  expanded,
}: {
  taskId: Id<"tasks">;
  count: number;
  completedCount: number;
  expanded: boolean;
}) {
  const chip = (
    <Pressable
      onPress={(e) => {
        e.stopPropagation?.();
        toggleSubtasksExpanded(taskId);
      }}
      hitSlop={8}
      accessibilityState={{ expanded }}
      accessibilityLabel={`${completedCount} of ${count} subtasks done. ${
        expanded ? "Hide" : "Show"
      } subtasks`}
      style={({ hovered }: any) => [styles.chip, hovered && styles.chipHover]}
    >
      <MaterialIcons
        name="account-tree"
        size={12}
        color={expanded ? Colors.primary : Colors.textTertiary}
      />
      <Text style={[styles.chipText, expanded && styles.chipTextActive]}>
        {completedCount}/{count}
      </Text>
    </Pressable>
  );
  if (!isWeb) return chip;
  const stop = (event: { stopPropagation: () => void }) =>
    event.stopPropagation();
  return (
    <div
      onPointerDown={stop}
      onTouchStart={stop}
      onClick={stop}
      style={{ display: "flex", flexShrink: 0 }}
    >
      {chip}
    </div>
  );
}

/**
 * On the web, pressing a button takes focus from the name field first,
 * which would end the edit (and remove the button) before the press
 * lands. This keeps focus where it is.
 */
function KeepFocus({ children }: { children: React.ReactNode }) {
  if (!isWeb) return <>{children}</>;
  return (
    <div
      onMouseDown={(event) => event.preventDefault()}
      style={{ display: "flex" }}
    >
      {children}
    </div>
  );
}

interface SubtaskListProps {
  parentId: Id<"tasks">;
  /** Focus the "Add subtask" field on mount (opened in order to add one). */
  autoFocusAdd?: boolean;
  /** Indent under a task row's title. */
  inset?: boolean;
}

export function SubtaskList({ parentId, autoFocusAdd, inset }: SubtaskListProps) {
  const {
    subtasks,
    timerSubtaskId,
    timerStartTime,
    add,
    rename,
    toggleCompleted,
    move,
    remove,
    toggleTimer,
    setTimeSpent,
  } = useSubtasks(parentId);

  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<Id<"tasks"> | null>(null);
  const [timeEditing, setTimeEditing] = useState<Doc<"tasks"> | null>(null);
  const addInputRef = useRef<TextInput>(null);

  // Drag state: which row is held, and how far it has been dragged.
  const activeIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const count = subtasks?.length ?? 0;

  const commitMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      const row = subtasks?.[fromIndex];
      if (row && toIndex !== fromIndex) move(row._id, toIndex);
      activeIndex.value = -1;
      dragY.value = 0;
    },
    [subtasks, move, activeIndex, dragY],
  );

  const submitDraft = useCallback(() => {
    const name = draft.trim();
    if (!name) return;
    add(name);
    setDraft("");
    // Stay in the field: subtasks are usually added several at a time.
    requestAnimationFrame(() => addInputRef.current?.focus());
  }, [draft, add]);

  if (subtasks === undefined) {
    return <View style={[styles.wrap, inset && styles.inset, styles.loading]} />;
  }

  return (
    <Isolate>
      <View style={[styles.wrap, inset && styles.inset]}>
        <View style={{ height: count * ROW_HEIGHT }}>
          {subtasks.map((subtask, index) => (
            <SubtaskRow
              key={subtask._id}
              subtask={subtask}
              index={index}
              count={count}
              activeIndex={activeIndex}
              dragY={dragY}
              isTicking={timerSubtaskId === subtask._id}
              timerStartTime={timerStartTime}
              editing={editingId === subtask._id}
              onStartEdit={setEditingId}
              onEndEdit={() => setEditingId(null)}
              onRename={rename}
              onToggleCompleted={toggleCompleted}
              onToggleTimer={toggleTimer}
              onSetTimeSpent={setTimeSpent}
              onEditTime={setTimeEditing}
              onRemove={remove}
              onCommitMove={commitMove}
            />
          ))}
        </View>
        <View style={styles.addRow}>
          <Ionicons name="add" size={16} color={Colors.textTertiary} />
          <TextInput
            ref={addInputRef}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={submitDraft}
            placeholder="Add subtask"
            placeholderTextColor={Colors.textTertiary}
            autoFocus={autoFocusAdd}
            submitBehavior="submit"
            returnKeyType="done"
            style={styles.addInput}
            accessibilityLabel="Add subtask"
          />
        </View>
      </View>
      {timeEditing && (
        <EditTimeSpentDialog
          taskName={plainMentions(timeEditing.name)}
          initialSeconds={timeEditing.timeSpentInSecondsUnallocated ?? 0}
          onClose={() => setTimeEditing(null)}
          onSave={(secs) => setTimeSpent(timeEditing._id, secs)}
        />
      )}
    </Isolate>
  );
}

interface SubtaskRowProps {
  subtask: Doc<"tasks">;
  index: number;
  count: number;
  activeIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  isTicking: boolean;
  timerStartTime: number | null;
  editing: boolean;
  onStartEdit: (id: Id<"tasks">) => void;
  onEndEdit: () => void;
  onRename: (id: Id<"tasks">, name: string) => void;
  onToggleCompleted: (id: Id<"tasks">, completed: boolean) => void;
  onToggleTimer: (id: Id<"tasks">) => void;
  onSetTimeSpent: (id: Id<"tasks">, seconds: number) => Promise<void>;
  onEditTime: (subtask: Doc<"tasks">) => void;
  onRemove: (id: Id<"tasks">) => void;
  onCommitMove: (fromIndex: number, toIndex: number) => void;
}

/** Where a row dragged `dy` from `from` would land. */
function dropIndex(from: number, dy: number, count: number): number {
  "worklet";
  return Math.max(0, Math.min(count - 1, Math.round(from + dy / ROW_HEIGHT)));
}

const SubtaskRow = React.memo(function SubtaskRow({
  subtask,
  index,
  count,
  activeIndex,
  dragY,
  isTicking,
  timerStartTime,
  editing,
  onStartEdit,
  onEndEdit,
  onRename,
  onToggleCompleted,
  onToggleTimer,
  onSetTimeSpent,
  onEditTime,
  onRemove,
  onCommitMove,
}: SubtaskRowProps) {
  const id = subtask._id;
  const isCompleted = !!subtask.dateCompleted;
  const seconds = subtask.timeSpentInSecondsUnallocated ?? 0;
  const [hovered, setHovered] = useState(false);
  const [name, setName] = useState(subtask.name);
  useEffect(() => {
    if (!editing) setName(subtask.name);
  }, [subtask.name, editing]);

  // The gesture is built once per position; handlers read through refs.
  const commitRef = useRef(onCommitMove);
  commitRef.current = onCommitMove;
  const lastDy = useRef(0);
  const pan = useMemo(() => {
    const gesture = Gesture.Pan()
      .runOnJS(true)
      .onStart((event) => {
        lastDy.current = event.translationY;
        activeIndex.value = index;
        dragY.value = event.translationY;
      })
      .onUpdate((event) => {
        lastDy.current = event.translationY;
        dragY.value = event.translationY;
      })
      .onEnd(() => {
        // The end event does not carry the travel on every platform (it
        // is 0 on the web), so the last update decides where the row lands.
        commitRef.current(index, dropIndex(index, lastDy.current, count));
      })
      .onFinalize((_event, success) => {
        if (!success) {
          activeIndex.value = -1;
          dragY.value = 0;
        }
      });
    // On a touch screen the list scrolls under the finger, so the grip
    // has to be held briefly before it picks the row up.
    return isWeb ? gesture.minDistance(3) : gesture.activateAfterLongPress(180);
  }, [index, count, activeIndex, dragY]);

  // While another row is dragged past this one, it steps aside by one
  // row. The step is animated once per change of position, not on every
  // frame of the drag.
  const stepAside = useSharedValue(0);
  useAnimatedReaction(
    () => {
      const active = activeIndex.value;
      if (active < 0 || active === index) return 0;
      const target = dropIndex(active, dragY.value, count);
      if (active < index && index <= target) return -ROW_HEIGHT;
      if (target <= index && index < active) return ROW_HEIGHT;
      return 0;
    },
    (next, previous) => {
      if (next === previous) return;
      // Dropped: the list re-renders in its new order, so snap back.
      stepAside.value =
        activeIndex.value < 0 ? 0 : withTiming(next, { duration: 120 });
    },
    [index, count],
  );

  const animatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value === index) {
      const min = -index * ROW_HEIGHT;
      const max = (count - 1 - index) * ROW_HEIGHT;
      return {
        transform: [
          { translateY: Math.max(min, Math.min(max, dragY.value)) },
        ],
        zIndex: 2,
        opacity: 0.9,
      };
    }
    return {
      transform: [{ translateY: stepAside.value }],
      zIndex: 0,
      opacity: 1,
    };
  }, [index, count]);

  const finishEdit = () => {
    const next = name.trim();
    onEndEdit();
    // Clearing the name and confirming deletes the subtask.
    if (!next) onRemove(id);
    else if (next !== subtask.name) onRename(id, next);
  };

  const showControls = !canHover || hovered || isTicking || editing;

  return (
    <Animated.View
      style={[styles.row, { top: index * ROW_HEIGHT }, animatedStyle]}
      {...(isWeb
        ? ({
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
          } as Record<string, unknown>)
        : null)}
    >
      <GestureDetector gesture={pan}>
        <View
          style={[styles.grip, !showControls && styles.hidden]}
          accessibilityLabel="Drag to reorder"
        >
          <MaterialIcons
            name="drag-indicator"
            size={16}
            color={Colors.textTertiary}
          />
        </View>
      </GestureDetector>

      <Pressable
        onPress={() => onToggleCompleted(id, !isCompleted)}
        hitSlop={6}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: isCompleted }}
        accessibilityLabel={isCompleted ? "Mark incomplete" : "Mark complete"}
        style={styles.iconBtn}
      >
        <CompleteCheckIcon checked={isCompleted} size={16} />
      </Pressable>

      {editing ? (
        <TextInput
          value={name}
          onChangeText={setName}
          onBlur={finishEdit}
          onSubmitEditing={finishEdit}
          autoFocus
          style={[styles.name, styles.nameInput]}
          accessibilityLabel="Subtask name"
        />
      ) : (
        <Pressable
          onPress={() => onStartEdit(id)}
          style={styles.nameBtn}
          accessibilityLabel={`Rename subtask ${plainMentions(subtask.name)}`}
        >
          <MentionText
            text={subtask.name}
            numberOfLines={1}
            style={[styles.name, isCompleted && styles.nameCompleted]}
          />
        </Pressable>
      )}

      {editing ? (
        <KeepFocus>
          <Pressable
            onPress={() => {
              onEndEdit();
              onRemove(id);
            }}
            hitSlop={6}
            accessibilityLabel="Delete subtask"
            style={styles.iconBtn}
          >
            <Ionicons name="trash-outline" size={15} color={Colors.error} />
          </Pressable>
        </KeepFocus>
      ) : (
        <>
          {!isCompleted && (
            <Pressable
              onPress={() => onToggleTimer(id)}
              hitSlop={6}
              accessibilityLabel={isTicking ? "Pause timer" : "Start timer"}
              style={[styles.iconBtn, !showControls && styles.hidden]}
            >
              <MaterialIcons
                name={isTicking ? "pause" : "play-arrow"}
                size={16}
                color={isTicking ? Colors.primary : Colors.textSecondary}
              />
            </Pressable>
          )}
          {(seconds > 0 || isTicking || (canHover && showControls)) &&
            (isTicking ? (
              <LiveElapsedText
                startTime={timerStartTime}
                baseSeconds={seconds}
                format={formatTicking}
                style={[styles.duration, styles.durationActive]}
              />
            ) : isWeb ? (
              <DurationPickerDesktop
                durationSeconds={seconds}
                onDurationChanged={(secs) => void onSetTimeSpent(id, secs)}
              />
            ) : (
              <Pressable
                onPress={() => onEditTime(subtask)}
                hitSlop={6}
                accessibilityLabel={`Edit time spent on ${plainMentions(
                  subtask.name,
                )}`}
              >
                <Text style={styles.duration}>{formatSecondsAsHM(seconds)}</Text>
              </Pressable>
            ))}
        </>
      )}
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  wrap: { width: "100%", paddingBottom: 4 },
  inset: { paddingLeft: 28 },
  loading: { height: ROW_HEIGHT },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ROW_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    columnGap: 4,
    paddingRight: 8,
  },
  grip: {
    width: 20,
    height: ROW_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: { cursor: "grab", touchAction: "none" } as any,
      default: {},
    }),
  },
  hidden: { opacity: 0 },
  iconBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({ web: { cursor: "pointer" } as any, default: {} }),
  },
  nameBtn: {
    flex: 1,
    minWidth: 0,
    height: ROW_HEIGHT,
    justifyContent: "center",
    ...Platform.select({ web: { cursor: "text" } as any, default: {} }),
  },
  name: {
    color: Colors.text,
    fontSize: FontSize.body,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 28,
    paddingVertical: 0,
    paddingHorizontal: 6,
    marginLeft: -6,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }),
  },
  nameCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  duration: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
    minWidth: 42,
    textAlign: "right",
  },
  durationActive: { color: Colors.primary, fontWeight: "600" },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: 6,
    height: ROW_HEIGHT,
    paddingLeft: 24,
    paddingRight: 8,
  },
  addInput: {
    flex: 1,
    minWidth: 0,
    height: 28,
    paddingVertical: 0,
    color: Colors.text,
    fontSize: FontSize.body,
    ...Platform.select({ web: { outlineStyle: "none" } as any, default: {} }),
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    height: 20,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surfaceContainerHigh,
    flexShrink: 0,
    ...Platform.select({ web: { cursor: "pointer" } as any, default: {} }),
  },
  chipHover: { backgroundColor: Colors.surfaceContainerHighest },
  chipText: {
    fontSize: FontSize.micro,
    color: Colors.textTertiary,
    fontVariant: ["tabular-nums"],
  },
  chipTextActive: { color: Colors.primary },
});

/**
 * The two pieces a task row needs, for rows drawn by a render function
 * (which cannot read the shared expanded state itself).
 */
export function TaskSubtaskChip({
  task,
}: {
  task: {
    _id: Id<"tasks">;
    subtaskCount?: number;
    subtaskCompletedCount?: number;
  };
}) {
  const expanded = useSubtasksExpanded(task._id);
  const count = task.subtaskCount ?? 0;
  if (count === 0 && !expanded) return null;
  return (
    <SubtaskChip
      taskId={task._id}
      count={count}
      completedCount={task.subtaskCompletedCount ?? 0}
      expanded={expanded}
    />
  );
}

/** The task's subtasks, when the task is expanded. */
export function TaskSubtasksPanel({
  taskId,
  inset,
}: {
  taskId: Id<"tasks">;
  inset?: boolean;
}) {
  const expanded = useSubtasksExpanded(taskId);
  if (!expanded) return null;
  return (
    <SubtaskList
      parentId={taskId}
      inset={inset}
      autoFocusAdd={consumeSubtaskAddFocus(taskId)}
    />
  );
}
