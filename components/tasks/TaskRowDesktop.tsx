import { FontSize, Radius } from "../../theme/tokens";
import React, { forwardRef, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  GestureResponderEvent,
} from "react-native";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { Colors } from "../../constants/colors";
import {
  todayYYYYMMDD,
  addDays,
  formatYYYYMMDDtoDDMMM,
  secondsToDurationString,
} from "../../lib/dates";
import { Id } from "../../convex/_generated/dataModel";
import { useTimerElapsed } from "../../hooks/useTimer";
import { DurationPickerDesktop } from "./DurationPickerDesktop";

const isWeb = Platform.OS === "web";

/**
 * True when the device has a real hover (mouse / trackpad). Rows keep their
 * timer controls hidden until hovered; on touch screens there is no hover,
 * so the controls stay visible there.
 */
const canHover =
  isWeb &&
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover)").matches;

/**
 * The card's drag listener sits on an ancestor. A bubble-phase stop on the
 * checkbox Pressable can lose to that listener on a phone browser. This
 * wrapper stops the pointer before it reaches the card, and `display: contents`
 * keeps the row layout unchanged.
 */
function StopRowDrag({ children }: { children: React.ReactNode }) {
  if (!isWeb) return <>{children}</>;
  return (
    <div
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
      onTouchStart={(event) => {
        event.stopPropagation();
      }}
      style={{ display: "contents" }}
    >
      {children}
    </div>
  );
}

export interface TaskRowTask {
  _id: Id<"tasks">;
  name: string;
  dateCompleted?: string;
  taskDay?: string;
  timeSpentInSecondsUnallocated?: number;
  trackableId?: string;
  listId?: string;
  tagIds?: string[];
  assignedToUserName?: string;
  taskDayOrderIndex?: number;
  sectionOrderIndex?: number;
  /**
   * True when this task is a materialized occurrence of a `recurringTasks`
   * series. Surfaced visually with a small "repeat" icon next to the
   * title so the user can distinguish series-instances from one-off
   * tasks at a glance — same affordance as productivity-one's row.
   */
  isRecurringInstance?: boolean;
  /**
   * Parent recurring-rule id (from the `recurringTasks` table). Present
   * on any row where `isRecurringInstance === true`.
   */
  recurringTaskId?: Id<"recurringTasks">;
}

export interface TaskRowMeta {
  trackable?: { name: string; colour: string } | null;
  list?: { name: string; colour: string; isGoalList?: boolean; isInbox?: boolean } | null;
  tags?: { name: string; colour: string }[];
}

export interface TaskRowDesktopProps {
  task: TaskRowTask;
  meta: TaskRowMeta;
  isTicking: boolean;
  /**
   * Epoch ms the running timer started at (`useTimer().startTime`).
   * The ticking row derives its own per-second elapsed from this, so
   * only THIS row re-renders each second — not the whole list.
   */
  timerStartTime: number | null;
  showDate?: boolean;
  isDragging?: boolean;
  isOverlay?: boolean;
  onSelect?: (taskId: Id<"tasks">) => void;
  onToggleComplete?: (taskId: Id<"tasks">) => void;
  onToggleTimer?: (taskId: Id<"tasks">) => void;
  /** Persist a manually-entered time-spent value (in seconds). Web-desktop only. */
  onSetTimeSpent?: (taskId: Id<"tasks">, newSeconds: number) => void;
  /** Called on right-click (web). Receives task id and the (clientX, clientY) of the event. */
  onRequestContextMenu?: (taskId: Id<"tasks">, x: number, y: number) => void;
  /**
   * dnd-kit drag activator props (`{...attributes, ...listeners}`) spread
   * onto the outer `<View>`. Whole-card drag — no separate handle.
   *
   * RN-Web's prop allowlist forwards `onPointerDown`, `onKeyDown`, `role`,
   * `tabIndex`, and all `aria-*`, which is exactly what dnd-kit returns,
   * so spreading these on a `<View>` works at runtime.
   */
  dragHandleProps?: Record<string, unknown>;
}

function getInitials(name?: string | null): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2)
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (parts[0]?.[0] ?? "").toUpperCase();
}

function getDateDisplay(day?: string): string | null {
  if (!day) return null;
  const today = todayYYYYMMDD();
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  return formatYYYYMMDDtoDDMMM(day);
}

export const TaskRowDesktop = forwardRef<View, TaskRowDesktopProps>(
  function TaskRowDesktop(props, ref) {
    const {
      task,
      meta,
      isTicking,
      timerStartTime,
      showDate,
      isDragging,
      isOverlay,
      onSelect,
      onToggleComplete,
      onToggleTimer,
      onSetTimeSpent,
      onRequestContextMenu,
      dragHandleProps,
    } = props;

    const isCompleted = !!task.dateCompleted;
    const baseSeconds = task.timeSpentInSecondsUnallocated ?? 0;
    // Only the ticking row subscribes to the 1s tick (null pauses it),
    // so the rest of the list is untouched while a timer runs.
    const liveElapsed = useTimerElapsed(isTicking ? timerStartTime : null);
    const totalSeconds = baseSeconds + (isTicking ? liveElapsed : 0);

    const initials = getInitials(task.assignedToUserName);
    const dateLabel = showDate ? getDateDisplay(task.taskDay) : null;

    const showTrackableTag = !!meta.trackable;
    // List (where it lives) and trackable (what it counts toward) are
    // independent, so a task can carry both tags.
    const showListTag =
      !!meta.list &&
      !meta.list.isGoalList &&
      !meta.list.isInbox;

    const handleContextMenu = useCallback(
      (e: GestureResponderEvent | any) => {
        if (!isWeb || !onRequestContextMenu) return;
        e?.preventDefault?.();
        e?.stopPropagation?.();
        const x = e?.clientX ?? e?.nativeEvent?.clientX ?? 0;
        const y = e?.clientY ?? e?.nativeEvent?.clientY ?? 0;
        onRequestContextMenu(task._id, x, y);
      },
      [onRequestContextMenu, task._id]
    );

    const stopAndCall = (cb?: () => void) => (e: any) => {
      e?.stopPropagation?.();
      cb?.();
    };

    /**
     * dnd-kit PointerSensor lives on the whole card. A checkbox/timer tap
     * that moves ~5px would otherwise start a drag, swallow the optimistic
     * complete patch, and look like a multi-second network stall.
     */
    const stopDragActivation = (e?: { stopPropagation?: () => void; nativeEvent?: { stopPropagation?: () => void; stopImmediatePropagation?: () => void } }) => {
      e?.stopPropagation?.();
      e?.nativeEvent?.stopPropagation?.();
      e?.nativeEvent?.stopImmediatePropagation?.();
    };
    const dragSafePressProps = isWeb
      ? ({
          onPointerDown: stopDragActivation,
          onTouchStart: stopDragActivation,
        } as Record<string, unknown>)
      : null;

    /* ─── Whole-card drag ─────────────────────────────────────────────────
     * Drag is handled entirely by dnd-kit (PointerSensor) via `dragHandleProps`
     * spread onto the outer `<View>`. There is NO grip and NO HTML5 native
     * drag — the previous HTML5 hybrid was removed because:
     *   1. RN-Web's `View` strips `draggable` / `onDragStart` (prop allowlist),
     *      so HTML5 drag only worked when we wrapped in a raw `<div>`.
     *   2. With both systems live on the same node the browser's HTML5 drag
     *      always wins the activation race against `PointerSensor`, silently
     *      breaking sortable reorder.
     * One drag system, one DndContext (lifted to DesktopHome) → reorder and
     * calendar drop both work via the same gesture.
     */
    // RN-Web forwards `onContextMenu` to the DOM at runtime (see
    // `react-native-web/dist/modules/forwardedProps`), but the TS types
    // don't expose it. Bundle it with `dragHandleProps` via a single
    // spread cast through `any`.
    const [hovered, setHovered] = useState(false);
    const webOnlyProps = isWeb
      ? ({
          onContextMenu: handleContextMenu,
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
        } as Record<string, unknown>)
      : null;

    // The row rests as plain text. Timer controls appear on hover; a
    // logged or running time stays visible because it is information,
    // not chrome.
    const showPlay = !canHover || hovered || isTicking;
    const showDuration = showPlay || totalSeconds > 0;

    const hasMeta =
      !!initials ||
      !!dateLabel ||
      showTrackableTag ||
      showListTag ||
      (meta.tags?.length ?? 0) > 0;

    return (
      <View
        ref={ref as any}
        style={[
          styles.rowWrap,
          isDragging && styles.rowWrapDragging,
          isOverlay && styles.rowWrapOverlay,
          isWeb && (styles.rowWrapWebGrab as any),
        ]}
        {...(webOnlyProps ?? {})}
        {...(dragHandleProps ?? {})}
      >
        <Pressable
          onPress={() => onSelect?.(task._id)}
          style={[
            styles.row,
            hovered && styles.rowHover,
            isTicking && styles.rowTicking,
            isOverlay && styles.rowOverlay,
            isCompleted && styles.rowCompleted,
          ]}
        >
          {/* Complete toggle */}
          <StopRowDrag>
            <Pressable
              onPress={stopAndCall(() => onToggleComplete?.(task._id))}
              onPressIn={stopDragActivation}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCompleted }}
              accessibilityLabel={
                isCompleted ? "Mark incomplete" : "Mark complete"
              }
              style={({ hovered: btnHovered }: any) => [
                styles.iconBtn,
                btnHovered && styles.iconBtnHover,
              ]}
              {...(dragSafePressProps ?? {})}
            >
              <MaterialIcons
                name={isCompleted ? "check-circle" : "radio-button-unchecked"}
                size={20}
                color={isCompleted ? Colors.success : Colors.textTertiary}
              />
            </Pressable>
          </StopRowDrag>

          {/* Title (with optional recurring-instance badge) */}
          <View style={styles.titleRow}>
            {task.isRecurringInstance && (
              <Ionicons
                name="repeat"
                size={14}
                color={Colors.textTertiary}
                style={styles.recurringIcon}
              />
            )}
            <Text
              numberOfLines={1}
              style={[styles.title, isCompleted && styles.titleCompleted]}
            >
              {task.name}
            </Text>
          </View>

          {/* Quiet metadata: a colour dot carries identity, the text stays
              grey. The column is the same width on every row and starts
              with the trackable / list label, so the dots line up down
              the list instead of floating with each label's length. */}
          {hasMeta && (
            <View style={styles.meta}>
              {showTrackableTag && meta.trackable && (
                <MetaLabel
                  colour={meta.trackable.colour}
                  name={meta.trackable.name}
                />
              )}
              {showListTag && meta.list && (
                <MetaLabel colour={meta.list.colour} name={meta.list.name} />
              )}
              {meta.tags?.map((tag, i) => (
                <MetaLabel key={i} colour={tag.colour} name={tag.name} />
              ))}
              {dateLabel && <Text style={styles.metaText}>{dateLabel}</Text>}
              {initials && (
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{initials}</Text>
                </View>
              )}
            </View>
          )}

          {/* Time: play on hover, duration once there is one */}
          <View style={styles.timeCol}>
            <StopRowDrag>
              <Pressable
                onPress={stopAndCall(() => onToggleTimer?.(task._id))}
                onPressIn={stopDragActivation}
                hitSlop={6}
                accessibilityLabel={isTicking ? "Pause timer" : "Start timer"}
                style={({ hovered: btnHovered, focused }: any) => [
                  styles.iconBtn,
                  btnHovered && styles.iconBtnHover,
                  !showPlay && !focused && styles.hidden,
                ]}
                {...(dragSafePressProps ?? {})}
              >
                <MaterialIcons
                  name={isTicking ? "pause" : "play-arrow"}
                  size={18}
                  color={isTicking ? Colors.primary : Colors.textSecondary}
                />
              </Pressable>
            </StopRowDrag>
            <View style={!showDuration && styles.hidden}>
              {isWeb ? (
                <DurationPickerDesktop
                  durationSeconds={totalSeconds}
                  showSeconds={isTicking}
                  /* While the timer is ticking, the value is live-driven —
                     don't let the user edit a moving target. */
                  readonly={isTicking || !onSetTimeSpent}
                  active={isTicking}
                  onDurationChanged={(secs) =>
                    onSetTimeSpent?.(task._id, secs)
                  }
                />
              ) : (
                <Text
                  style={[styles.duration, isTicking && styles.durationActive]}
                >
                  {secondsToDurationString(totalSeconds, isTicking)}
                </Text>
              )}
            </View>
          </View>
        </Pressable>
      </View>
    );
  }
);

function MetaLabel({ colour, name }: { colour?: string; name: string }) {
  return (
    <View style={styles.metaLabel}>
      <View
        style={[styles.metaDot, { backgroundColor: colour || Colors.neutral }]}
      />
      <Text style={styles.metaText} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rowWrap: {
    width: "100%",
    alignSelf: "stretch",
    ...Platform.select({
      web: {
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      } as any,
      default: {},
    }),
  },
  // The whole row is the drag source. Cursor flips to `grabbing` while
  // dnd-kit's PointerSensor is active; `grab` here is the resting hint.
  rowWrapWebGrab: {
    cursor: "grab",
  } as any,
  rowWrapDragging: {
    opacity: 0.4,
  },
  rowWrapOverlay: {
    ...Platform.select({
      web: {
        cursor: "grabbing",
        boxShadow: "0 12px 24px rgba(0,0,0,0.5)",
      } as any,
      default: {},
    }),
  },
  // Flat row: no surface, no border. Separation comes from spacing and a
  // faint hover wash, so the list reads as text rather than as boxes.
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 40,
    paddingVertical: 4,
    paddingHorizontal: 8,
    columnGap: 8,
    borderRadius: Radius.md,
    ...Platform.select({
      web: { transition: "background-color 120ms ease" } as any,
      default: {},
    }),
  },
  rowHover: {
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rowTicking: {
    backgroundColor: Colors.accentWash,
  },
  /** The drag overlay floats over other rows, so it needs a solid surface. */
  rowOverlay: {
    backgroundColor: Colors.surfaceContainerHigh,
  },
  rowCompleted: {
    opacity: 0.5,
  },
  hidden: { opacity: 0 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: Radius.xl,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "background-color 120ms ease, opacity 120ms ease",
      } as any,
      default: {},
    }),
  },
  iconBtnHover: {
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  title: {
    flexShrink: 1,
    minWidth: 0,
    color: Colors.text,
    fontSize: FontSize.body,
    fontWeight: "400",
  },
  // The title wins the width: it takes its natural size first and the
  // metadata gives way (see `meta.flexShrink`).
  titleRow: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  recurringIcon: { flexShrink: 0 },
  titleCompleted: {
    textDecorationLine: "line-through",
    color: Colors.textTertiary,
  },
  // A fixed-width column, left-aligned, so every row's first dot sits at
  // the same x. Labels that don't fit are cut off with an ellipsis.
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 12,
    // Narrow on purpose: the title is what people read, the label is a cue.
    width: "24%",
    minWidth: 96,
    maxWidth: 160,
    flexShrink: 0,
    overflow: "hidden",
  },
  metaLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
    minWidth: 0,
  },
  metaDot: { width: 6, height: 6, borderRadius: Radius.pill, flexShrink: 0 },
  metaText: {
    fontSize: FontSize.caption,
    color: Colors.textTertiary,
    flexShrink: 1,
    ...Platform.select({
      web: { whiteSpace: "nowrap" } as object,
      default: {},
    }),
  },
  timeCol: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  duration: {
    color: Colors.textSecondary,
    fontSize: FontSize.caption,
    fontVariant: ["tabular-nums"] as any,
    minWidth: 48,
    textAlign: "right",
  },
  durationActive: {
    color: Colors.primary,
    fontWeight: "600",
  },
  avatar: {
    width: 20,
    height: 20,
    borderRadius: Radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surfaceContainerHighest,
  },
  avatarText: {
    fontSize: FontSize.micro,
    fontWeight: "600",
    color: Colors.textSecondary,
    lineHeight: 10,
  },
});

/** Standalone placeholder used while a card is being dragged (matches angular `task-drag-placeholder`). */
export function TaskDragPlaceholder() {
  return (
    <View style={placeholderStyles.placeholder}>
      <View style={placeholderStyles.stripes} />
    </View>
  );
}

const placeholderStyles = StyleSheet.create({
  placeholder: {
    width: "100%",
    alignSelf: "stretch",
    height: 40,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    overflow: "hidden",
  },
  stripes: {
    flex: 1,
    ...Platform.select({
      web: {
        backgroundImage:
          "repeating-linear-gradient(45deg, rgba(255,255,255,0.05), rgba(255,255,255,0.05) 8px, rgba(255,255,255,0.02) 8px, rgba(255,255,255,0.02) 16px)",
      } as any,
      default: {
        backgroundColor: "rgba(255,255,255,0.05)",
      },
    }),
  },
});
